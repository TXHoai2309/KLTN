import { AsyncLocalStorage } from "node:async_hooks";
export const readSpans = new AsyncLocalStorage();
export function unionMs(spans) {
  const sorted=spans.map(s=>[s.start,s.end]).sort((a,b)=>a[0]-b[0]);
  let total=0,start=null,end=null;
  for(const [a,b]of sorted){if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else{total+=end-start;start=a;end=b;}}
  return total+(start===null?0:end-start);
}
// Benchmark-only observer. Original overloads/callbacks/SQL are preserved. SQL
// and params stay in memory for bounded EXPLAIN replay; neither is serialized.
export function observeNeonFactory(factory) {
  const connect=factory.connect.bind(factory),seen=new WeakSet(),patched=new WeakSet();
  factory.connect=async()=>{
    const adapter=await connect(),pool=adapter.underlyingDriver(),acquire=pool.connect.bind(pool);
    const record=(client,scope,start)=>{
      scope?.connections.push({start,end:performance.now(),fresh:!seen.has(client),waiting:pool.waitingCount,total:pool.totalCount,idle:pool.idleCount});seen.add(client);
      if(patched.has(client))return;patched.add(client);
      const query=client.query.bind(client);
      client.query=(...args)=>{
        const active=readSpans.getStore(),begin=performance.now();
        const finish=()=>active?.queries.push({start:begin,end:performance.now()});
        const statement=typeof args[0]==="string"?args[0]:args[0]?.text;
        const params=Array.isArray(args[1])?args[1]:args[0]?.values??[];
        if(active&&active.explain.length<16&&typeof statement==="string"&&/^SELECT\s/i.test(statement)&&!statement.includes("set_config"))active.explain.push({text:statement,values:params});
        const last=args.length-1;
        if(typeof args[last]==="function"){const callback=args[last];args[last]=(...values)=>{finish();return callback(...values);};try{return query(...args);}catch(e){finish();throw e;}}
        try{const result=query(...args);return result?.then?result.then(v=>{finish();return v;},e=>{finish();throw e;}):result;}catch(e){finish();throw e;}
      };
    };
    pool.connect=(callback)=>{
      const scope=readSpans.getStore(),start=performance.now();
      if(typeof callback==="function")return acquire((error,client,release)=>{if(client)record(client,scope,start);return callback(error,client,release);});
      return acquire().then(client=>{record(client,scope,start);return client;});
    };
    return adapter;
  };
  return factory;
}

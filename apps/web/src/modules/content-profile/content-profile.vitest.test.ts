import { describe,it,expect } from "vitest";
import { destinationProfileSchema,cultureProfileSchema,sourceSchema,mediaSchema,publicHttpsUrl } from "./content-profile-contract";
import { profileWrite } from "./content-profile-service";
import type { Prisma } from "@KLTN/db";
describe("Admin profile contracts",()=>{
 it("legacy defaults are safe and independent cultures have no destinations",()=>{const p=cultureProfileSchema.parse({});expect(p.areaIds).toEqual([]);expect(p.communityIds).toEqual([]);expect(p.sources).toEqual([]);expect(destinationProfileSchema.parse({}).locationVerified).toBe(false);});
 it("supports multiple structured identities and deduplicates",()=>{expect(cultureProfileSchema.parse({areaIds:["a","b","a"],communityIds:["c","d"]}).areaIds).toEqual(["a","b"]);});
 it("never infers rights from a source URL",()=>{expect(sourceSchema.parse({title:"Source",url:"https://example.org/article"}).openAiRights).toBe("UNKNOWN");});
 it.each(["websiteRights","indexingRights","openAiRights"])("approval of %s requires evidence",key=>{expect(sourceSchema.safeParse({title:"Source",[key]:"APPROVED"}).success).toBe(false);expect(sourceSchema.safeParse({title:"Source",[key]:"APPROVED",rightsEvidence:"Owner signed grant"}).success).toBe(true);});
 it("rejects forged reviewers, duplicate covers, unverified evidence",()=>{expect(sourceSchema.safeParse({title:"Source",reviewedBy:"admin"}).success).toBe(false);expect(destinationProfileSchema.safeParse({locationVerified:true}).success).toBe(false);expect(destinationProfileSchema.safeParse({ticketVerification:"VERIFIED",ticketPrice:"100"}).success).toBe(false);const m={url:"https://example.org/photo.jpg",alt:"Photo",isCover:true};expect(cultureProfileSchema.safeParse({media:[m,m]}).success).toBe(false);expect(mediaSchema.safeParse({...m,websiteRights:"APPROVED"}).success).toBe(false);});
 it.each(["http://example.org/a","https://user:password@example.org/a","https://127.0.0.1/a","javascript:alert(1)"])("rejects unsafe URL %s",url=>expect(publicHttpsUrl.safeParse(url).success).toBe(false));
 it("old clients preserve profile without additional queries",async()=>{expect(await profileWrite({} as Prisma.TransactionClient,undefined,"admin",true)).toEqual({});});
 it("rejects missing references before replacement",async()=>{const tx={area:{findMany:async()=>[]},community:{},cultureContent:{}} as unknown as Prisma.TransactionClient;await expect(profileWrite(tx,cultureProfileSchema.parse({areaIds:["missing"]}),"admin",true)).rejects.toMatchObject({code:"INVALID_CONTENT_REFERENCES"});});
});

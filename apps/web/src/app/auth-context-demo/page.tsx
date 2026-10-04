import { notFound } from "next/navigation";

import AuthContextDemo from "./auth-context-demo";

export default function AuthContextDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <AuthContextDemo />;
}

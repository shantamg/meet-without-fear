import { redirect } from "next/navigation";

// The native-app download page moved to /download. /app now funnels visitors
// straight to the hosted web app so there's no install step in the way.
export default function AppRedirect(): never {
  redirect("https://app.meetwithoutfear.com/");
}

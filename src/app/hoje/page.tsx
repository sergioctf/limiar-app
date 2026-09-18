import { redirect } from "next/navigation";

/** The prototype of 18/09 became the Home; the link kept working. */
export default function HojePage() {
  redirect("/");
}

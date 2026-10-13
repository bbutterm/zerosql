import { redirect } from "next/navigation";

/** Старый адрес стола: /game → /play */
export default function LegacyGamePage() {
  redirect("/play");
}

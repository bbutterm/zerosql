import type { Metadata } from "next";
import { ArchiveRoot } from "./archive-root";

export const metadata: Metadata = { title: "Архив" };

/** Свободный архив: вся база после сезона, без задач */
export default function ArchivePage() {
  return <ArchiveRoot />;
}

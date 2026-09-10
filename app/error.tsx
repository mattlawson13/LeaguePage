"use client";

import { ManagerDataError } from "@/components/ManagerDataError";

export default function RootError({ error }: { error: Error & { digest?: string } }) {
  return <ManagerDataError message={error.message} />;
}

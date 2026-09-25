import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { requireUser } from "@/server/auth";
import { exportAll } from "@/server/data";

export const GET = route(async () => {
  await requireUser("admin");
  const backup = await exportAll();
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="seba-sohayok-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

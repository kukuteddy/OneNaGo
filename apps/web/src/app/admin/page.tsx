import type { Metadata } from "next";
import { AdminConsole } from "@/components/AdminConsole";
import { getData } from "@/lib/data";

export const metadata: Metadata = {
  title: "管理審核",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const { shops } = await getData();
  // 只傳審核畫面需要的欄位（都是公開資訊）
  const index = Object.fromEntries(shops.map((s) => [s.id, { name: s.name, shortId: s.shortId }]));
  return <AdminConsole shops={index} />;
}

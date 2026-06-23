import type { Metadata } from "next";
import GroupDashboard from "./group-dashboard-client";

const privateGroupMetadata = (canonical: string): Metadata => ({
  title: "Private Group Ledger",
  description: "Private Splitvero group ledger for tracking shared expenses.",
  alternates: {
    canonical,
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<Metadata> {
  const { groupId } = await params;
  return privateGroupMetadata(`/groups/${groupId}`);
}

export default function GroupPage() {
  return <GroupDashboard />;
}

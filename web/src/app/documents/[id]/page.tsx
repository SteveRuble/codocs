import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Navbar from "@/components/Navbar";
import DocumentView from "@/components/DocumentView";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/");
  const { id } = await params;
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl p-4">
        <DocumentView id={id} />
      </main>
    </>
  );
}

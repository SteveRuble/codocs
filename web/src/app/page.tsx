import { auth, signIn } from "@/auth";
import Navbar from "@/components/Navbar";
import DocumentsClient from "@/components/DocumentsClient";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    return (
      <div className="hero min-h-screen">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-5xl font-bold">codocs</h1>
            <p className="py-6">Upload a document, select lines, and discuss them with your team.</p>
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/" });
              }}
            >
              <button className="btn btn-primary" type="submit">Sign in with GitHub</button>
            </form>
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl p-4">
        <DocumentsClient />
      </main>
    </>
  );
}

import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function Navbar() {
  const session = await auth();
  const user = session?.user;
  return (
    <div className="navbar bg-base-100 shadow">
      <div className="flex-1">
        <Link href="/" className="btn btn-ghost text-xl">codocs</Link>
      </div>
      {user && (
        <div className="flex flex-none items-center gap-3">
          {user.image && (
            <div className="avatar">
              <div className="w-8 rounded-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.image} alt={user.login} />
              </div>
            </div>
          )}
          <span className="text-sm">{user.name ?? user.login}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="btn btn-sm btn-outline" type="submit">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}

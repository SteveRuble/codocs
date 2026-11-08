import type { UserRef } from "@/lib/api";

export default function Avatar({ user, size = 8 }: { user: UserRef; size?: number }) {
  return (
    <div className="avatar placeholder">
      <div className="rounded-full bg-neutral text-neutral-content" style={{ width: size * 4, height: size * 4 }}>
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={user.login} />
        ) : (
          <span className="text-xs">{user.login.slice(0, 2)}</span>
        )}
      </div>
    </div>
  );
}

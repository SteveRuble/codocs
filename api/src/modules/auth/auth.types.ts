import type { User } from "../../generated/prisma/client.js";

// Declaration merging: adds an optional `user` property to Express's Request type for the
// whole program. This is the standard way to type data that middleware attaches to the
// request. It is optional because it only exists AFTER `authenticate` has run; handlers
// should read it through `currentUser(req)` (auth/currentUser.ts), not `req.user` directly.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

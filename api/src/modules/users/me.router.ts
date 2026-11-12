import { Router } from "express";
import { currentUser } from "../auth/currentUser.js";

// GET /api/me: who am I? Mounted behind `authenticate`, so currentUser() is always set.
export function createMeRouter(): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const user = currentUser(req);
    // An explicit response shape (a DTO), NOT `res.json(user)`. The row has columns the
    // client shouldn't see (email, timestamps), and returning the raw object means every
    // column added to the table later leaks into the API automatically.
    res.json({ id: user.id, githubId: user.githubId, login: user.login, name: user.name, image: user.image });
  });

  return router;
}

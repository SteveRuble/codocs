import express from "express";
import { errorHandler } from "./middleware/errorHandler";
import { booksRouter } from "./routes/books";
import { loansRouter } from "./routes/loans";
import { membersRouter } from "./routes/members";
import { AppError } from "./errors";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/books", booksRouter);
app.use("/loans", loansRouter);
app.use("/members", membersRouter);

app.use((req, _res, next) => {
  next(new AppError(404, `No route for ${req.method} ${req.path}`));
});

app.use(errorHandler);

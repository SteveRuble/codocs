import { app } from "./app";

const port = Number(process.env.PORT ?? 3100);

app.listen(port, () => {
  console.log(`library-api listening on port ${port}`);
});

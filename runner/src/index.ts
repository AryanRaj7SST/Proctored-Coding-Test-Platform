import express from "express";
import runRouter from "./routes/run.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/run", runRouter);
app.listen(port, () => console.log(`Runner listening on port ${port}`));

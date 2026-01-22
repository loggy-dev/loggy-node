import express from "express";
import { CreateLoggy } from "../../src/index";

const app = express();

const loggy = CreateLoggy({
  identifier: "test-express",
});

app.use(express.json());

app.listen(3000, () => loggy.log(`🚀 Server ready at: http://localhost:3000`));

app.get("/log", async (req, res) => {
  loggy.log(`GET /log`);
  res.json({ message: "Log endpoint" });
});

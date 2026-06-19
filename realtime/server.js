import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const port = Number(process.env.PORT ?? 3001);
const allowedOrigin = process.env.SOCKET_CORS_ORIGIN ?? "*";

const app = express();
app.use(cors({ origin: allowedOrigin === "*" ? true : allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigin === "*" ? true : allowedOrigin }
});

app.get("/health", (_request, response) => {
  response.json({ ok: true, clients: io.engine.clientsCount });
});

app.post("/emit/alarm", (request, response) => {
  io.emit("alarm:created", request.body);
  response.status(202).json({ ok: true });
});

io.on("connection", (socket) => {
  socket.emit("connected", { id: socket.id });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Realtime gateway listening on ${port}`);
});

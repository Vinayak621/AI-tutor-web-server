import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import resumeRoutes from "./routes/resume.routes.js";
import http from "http";

import { setupWebSocket } from "./components/WsServer.js";

dotenv.config(); 

const app = express();

app.use(cookieParser());
app.use(cors({ origin: "http://localhost:8080", credentials: true }));
app.use(bodyParser.json());

mongoose
  .connect(process.env.MONGO_DB_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

const server = http.createServer();
setupWebSocket(server);

app.use("/api", authRoutes);
app.use("/api", resumeRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

server.listen(8000, () => {
  console.log(`WebSocket server running on ws://localhost:8000`);
});

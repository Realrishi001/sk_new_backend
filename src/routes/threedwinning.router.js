import express from "express";
import { getTodayWinningNumbers, saveWinningNumber } from "../controller/threedWinning.controller.js";

const router = express.Router();

router.post("/save-winning", saveWinningNumber);
router.get("/get-winning-today", getTodayWinningNumbers);

export default router;

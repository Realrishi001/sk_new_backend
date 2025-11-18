import express from "express";
import { togglePriorityAdmin } from "../controller/priorWinning.controller.js";

const router = express.Router();

// Toggle priorWinning for an admin
router.put("/priority-admins/:adminId/toggle", togglePriorityAdmin);

export default router;

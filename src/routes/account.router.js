import express from "express";
import { getSummaryReport, netToPaySummary, pointsAllocatedByDate } from "../controller/account.controller.js";

const router = express.Router();

router.post("/pointssummary", getSummaryReport);
router.post("/nettopaysummary", netToPaySummary);
router.post("/pointallocation", pointsAllocatedByDate);

export default router;

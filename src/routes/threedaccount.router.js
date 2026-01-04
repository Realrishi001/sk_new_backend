import express from 'express'
import { get3DSummaryReport, netToPay3DSummary, pointsAllocatedByDate3D } from '../controller/threedaccount.controller.js';

const router = express.Router();

router.post("/3d/pointssummary", get3DSummaryReport);
router.post("/3d/nettopaysummary", netToPay3DSummary);
router.post("/3d/pointallocation", pointsAllocatedByDate3D);


export default router;
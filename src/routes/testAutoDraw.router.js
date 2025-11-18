import express from 'express';
import { manualGenerateWinningNumbers } from '../controller/testAutoDraw.Controller.js';

const router = express.Router();

// Define the manual route for triggering the auto draw
router.post('/manual-trigger', manualGenerateWinningNumbers);

export default router;

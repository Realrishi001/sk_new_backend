import express from 'express'
import { checkTicketWinningStatus, claimTicket, getClaimedTickets, getPendingClaimTickets } from '../controller/claimedTickets.controller.js';

const router = express.Router();

router.post("/is-claim-tickets",checkTicketWinningStatus);
router.post("/save-claimed-ticket", claimTicket);
router.post("/get-claimed-tickets",getClaimedTickets);
router.post("/pending-claims", getPendingClaimTickets);

export default router;


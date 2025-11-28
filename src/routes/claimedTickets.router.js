import express from 'express'
import { checkTicketWinningStatus, claimTicket, getAllPendingClaimTickets, getClaimedTickets, getPendingClaimTickets } from '../controller/claimedTickets.controller.js';

const router = express.Router();

router.post("/is-claim-tickets",checkTicketWinningStatus);
router.post("/save-claimed-ticket", claimTicket);
router.post("/get-claimed-tickets",getClaimedTickets);
router.post("/pending-claims", getPendingClaimTickets);
router.post("/all-pending-claims", getAllPendingClaimTickets);

export default router;


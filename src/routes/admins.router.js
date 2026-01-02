import { addAdminBalance, adminLogin, adminLogout, changeAdminPassword, createAdmin, deleteAdmin, deleteAdminByUserName, getAdminDetails, getAdminUsernamesAndBalance, getAdminUsernamesAndCommissions, getAllAdmins, getAllAdminsStatus, mainAdminLogin, updateAdmin, updateAdminCommission } from '../controller/admins.controller.js';
import { deleteCommission, deleteBalance } from '../controller/adminDelete.controller.js';
import express from 'express'

const router = express.Router();

router.post('/create-admin', createAdmin);
router.get("/get-admins", getAllAdmins);
router.post("/update-admin", updateAdmin);
router.post("/delete-admin", deleteAdmin);
router.post("/login-admin", adminLogin);
router.post("/update-commission", updateAdminCommission);
router.get("/get-commission-details", getAdminUsernamesAndCommissions);
router.post("/delete-commission", deleteAdminByUserName);
router.post("/main-admin-login", mainAdminLogin);
router.post("/update-balance", addAdminBalance);
router.get("/get-balance", getAdminUsernamesAndBalance);
router.get("/shop-report", getAdminDetails);
router.post("/change-password", changeAdminPassword);
router.post("/logout", adminLogout);
router.get("/get-all-admin-status", getAllAdminsStatus);

router.delete("/delete-commission", deleteCommission);
router.delete("/delete-balance", deleteBalance);

export default router;
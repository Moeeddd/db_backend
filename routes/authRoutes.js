const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/register", authController.registerCustomer);
router.post("/register-driver", authController.registerDriver);
router.post("/register-admin",  authController.registerAdmin);
router.post("/login", authController.login);

module.exports = router;
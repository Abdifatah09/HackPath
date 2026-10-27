const router = require('express').Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/refresh', authController.refresh);
router.get('/logout', requireAuth, authController.logout);
router.delete('/delete/:userIdToDelete', requireAuth, authController.deleteUser);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);



module.exports = router;

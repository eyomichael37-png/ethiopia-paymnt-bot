const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DB_PATH, 'users.json');
const PAYMENTS_FILE = path.join(DB_PATH, 'payments.json');

// Ensure data directory exists
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(DB_PATH, { recursive: true });
}

// Initialize files if they don't exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}
if (!fs.existsSync(PAYMENTS_FILE)) {
  fs.writeFileSync(PAYMENTS_FILE, JSON.stringify({ payments: [], nextId: 1 }, null, 2));
}

// User operations
const db = {
  // Register new user
  registerUser: (user) => {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const existingUser = data.users.find(u => u.id === user.id);
    
    if (!existingUser) {
      data.users.push({
        id: user.id,
        username: user.username || '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        phone: user.phone || '',
        registeredAt: new Date().toISOString(),
        totalPaid: 0,
        status: 'active'
      });
      fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
    }
    return user.id;
  },

  // Get user by ID
  getUser: (userId) => {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return data.users.find(u => u.id === userId);
  },

  // Update user phone number
  updateUserPhone: (userId, phone) => {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = data.users.find(u => u.id === userId);
    if (user) {
      user.phone = phone;
      fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
      return true;
    }
    return false;
  },

  // Create payment request
  createPayment: (userId, amount, provider, accountDetails) => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    const paymentId = data.nextId;
    
    const payment = {
      id: paymentId,
      userId: userId,
      amount: amount,
      provider: provider,
      accountDetails: accountDetails,
      status: 'pending', // pending, approved, rejected
      receiptFileId: null,
      receiptCaption: null,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      notes: null
    };
    
    data.payments.push(payment);
    data.nextId++;
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
    return payment;
  },

  // Update payment with receipt
  updatePaymentReceipt: (paymentId, fileId, caption) => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    const payment = data.payments.find(p => p.id === paymentId);
    if (payment) {
      payment.receiptFileId = fileId;
      payment.receiptCaption = caption;
      payment.status = 'waiting_verification';
      fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
      return true;
    }
    return false;
  },

  // Get user's pending payment
  getUserPendingPayment: (userId) => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    return data.payments.find(p => p.userId === userId && p.status === 'pending');
  },

  // Get payment by ID
  getPayment: (paymentId) => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    return data.payments.find(p => p.id === parseInt(paymentId));
  },

  // Get all pending payments for admin
  getPendingPayments: () => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    return data.payments.filter(p => p.status === 'waiting_verification');
  },

  // Get all payments (for admin)
  getAllPayments: (limit = 50) => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    return data.payments.slice(-limit).reverse();
  },

  // Approve payment
  approvePayment: (paymentId, adminId, notes = '') => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    const payment = data.payments.find(p => p.id === paymentId);
    if (payment && payment.status === 'waiting_verification') {
      payment.status = 'approved';
      payment.reviewedAt = new Date().toISOString();
      payment.reviewedBy = adminId;
      payment.notes = notes;
      fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
      
      // Update user's total paid
      const userData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      const user = userData.users.find(u => u.id === payment.userId);
      if (user) {
        user.totalPaid = (user.totalPaid || 0) + parseFloat(payment.amount);
        fs.writeFileSync(USERS_FILE, JSON.stringify(userData, null, 2));
      }
      return true;
    }
    return false;
  },

  // Reject payment
  rejectPayment: (paymentId, adminId, reason) => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    const payment = data.payments.find(p => p.id === paymentId);
    if (payment && payment.status === 'waiting_verification') {
      payment.status = 'rejected';
      payment.reviewedAt = new Date().toISOString();
      payment.reviewedBy = adminId;
      payment.notes = reason;
      fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
      return true;
    }
    return false;
  },

  // Get user's payment history
  getUserPayments: (userId) => {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    return data.payments.filter(p => p.userId === userId).reverse();
  }
};

module.exports = db;
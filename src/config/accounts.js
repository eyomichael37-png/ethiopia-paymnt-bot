// Add your actual bank and wallet accounts here
module.exports = {
  banks: {
    'commercial_bank_of_ethiopia': {
      name: '🏦 Commercial Bank of Ethiopia (CBE)',
      accountName: 'Your Business Name',
      accountNumber: '1000525181425',
      branch: 'Bole Branch',
      additionalInfo: 'You can deposit at any CBE branch or via CBE Birr'
    },
    'dashen_bank': {
      name: '🏦 Dashen Bank',
      accountName: 'Your Business Name',
      accountNumber: '1234567890',
      branch: 'Megenagna Branch',
      additionalInfo: 'Dashen Online Banking available'
    },
    'awash_bank': {
      name: '🏦 Awash Bank',
      accountName: 'Your Business Name', 
      accountNumber: '0987654321',
      branch: 'Kazanchis Branch',
      additionalInfo: 'Awash Mobile Banking supported'
    },
    'abyssinia_bank': {
      name: '🏦 Abyssinia Bank',
      accountName: 'Your Business Name',
      accountNumber: '5566778899',
      branch: 'Bambis Branch',
      additionalInfo: ''
    },
    'hibret_bank': {
      name: '🏦 Hibret Bank',
      accountName: 'Your Business Name',
      accountNumber: '1122334455',
      branch: 'Meskel Square',
      additionalInfo: ''
    },
    'cooperative_bank': {
      name: '🏦 Cooperative Bank of Oromia (CBO)',
      accountName: 'Your Business Name',
      accountNumber: '9988776655',
      branch: 'Bole Rwanda',
      additionalInfo: ''
    }
  },
  wallets: {
    'telebirr': {
      name: '📱 Telebirr',
      accountType: 'Telebirr Merchant/Customer Number',
      accountNumber: '0996497882',
      accountName: 'Your Business Name',
      instructions: '1. Open Telebirr app\n2. Select "Pay"\n3. Enter number: 0912345678\n4. Enter amount\n5. Confirm payment\n6. Take screenshot of receipt'
    },
    'mpesa': {
      name: '📱 M-Pesa Ethiopia',
      accountType: 'M-Pesa Merchant/Paybill',
      accountNumber: '123456',
      accountName: 'Your Business Name',
      instructions: '1. Open M-Pesa app\n2. Select "Lipa na M-Pesa"\n3. Enter Paybill: 123456\n4. Enter Account: YourName\n5. Enter amount\n6. Enter PIN\n7. Screenshot confirmation'
    },
    'cbe_birr': {
      name: '📱 CBE Birr',
      accountType: 'CBE Birr Number',
      accountNumber: '0912345678',
      accountName: 'Your Business Name',
      instructions: '1. Open CBE Birr app\n2. Select "Transfer"\n3. Enter number: 0912345678\n4. Enter amount\n5. Confirm\n6. Screenshot receipt'
    }
  },
  crypto: {
    // Optional: Add crypto wallets if needed
    'bitcoin': {
      name: '₿ Bitcoin',
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    }
  }
};
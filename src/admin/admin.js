async function handleAdminCommand(bot, command, args, chatId, db) {
  switch (command) 
   { // Add after the switch statement opening
      case 'cancel':
    bot.sendMessage(chatId, '✅ Operation cancelled.');
    break;
    case 'approve':
      if (!args) {
        bot.sendMessage(chatId, '❌ Usage: /approve <payment_id> [notes]');
        return;
      }
      
      const approveParts = args.split(' ');
      const approveId = parseInt(approveParts[0]);
      const approveNotes = approveParts.slice(1).join(' ');
      
      const paymentToApprove = db.getPayment(approveId);
      if (!paymentToApprove) {
        bot.sendMessage(chatId, `❌ Payment #${approveId} not found.`);
        return;
      }
      
      const approved = db.approvePayment(approveId, chatId, approveNotes);
      if (approved) {
        bot.sendMessage(chatId, `✅ Payment #${approveId} approved successfully!`);
        
        // Notify user
        const user = db.getUser(paymentToApprove.userId);
        if (user) {
          const userMessage = `
✅ *PAYMENT APPROVED!*

Your payment of ${paymentToApprove.amount} ETB has been verified and approved.

*Payment ID:* #${paymentToApprove.id}
*Amount:* ${paymentToApprove.amount} ETB
*Date:* ${new Date(paymentToApprove.submittedAt).toLocaleDateString()}

Thank you for your payment! 🎉

${approveNotes ? `\n*Note from Admin:* ${approveNotes}` : ''}
          `;
          bot.sendMessage(paymentToApprove.userId, userMessage, { parse_mode: 'Markdown' });
        }
      } else {
        bot.sendMessage(chatId, `❌ Could not approve #${approveId}. Make sure it's pending verification.`);
      }
      break;
      
    case 'reject':
      if (!args) {
        bot.sendMessage(chatId, '❌ Usage: /reject <payment_id> <reason>');
        return;
      }
      
      const rejectParts = args.split(' ');
      const rejectId = parseInt(rejectParts[0]);
      const reason = rejectParts.slice(1).join(' ') || 'No reason provided';
      
      const paymentToReject = db.getPayment(rejectId);
      if (!paymentToReject) {
        bot.sendMessage(chatId, `❌ Payment #${rejectId} not found.`);
        return;
      }
      
      const rejected = db.rejectPayment(rejectId, chatId, reason);
      if (rejected) {
        bot.sendMessage(chatId, `❌ Payment #${rejectId} rejected. Reason: ${reason}`);
        
        // Notify user
        const user = db.getUser(paymentToReject.userId);
        if (user) {
          const userMessage = `
❌ *PAYMENT REJECTED*

Your payment of ${paymentToReject.amount} ETB has been rejected.

*Payment ID:* #${paymentToReject.id}
*Reason:* ${reason}

Please make the payment again correctly and submit a new receipt.

Contact support if you have questions.
          `;
          bot.sendMessage(paymentToReject.userId, userMessage, { parse_mode: 'Markdown' });
        }
      } else {
        bot.sendMessage(chatId, `❌ Could not reject #${rejectId}. Make sure it's pending verification.`);
      }
      break;
      
    case 'pending':
      const pendingPayments = db.getPendingPayments();
      if (pendingPayments.length === 0) {
        bot.sendMessage(chatId, '📭 No pending payments to verify.');
        return;
      }
      
      let pendingMsg = `⏳ *Pending Payments (${pendingPayments.length})*\n\n`;
      pendingPayments.forEach(p => {
        const user = db.getUser(p.userId);
        pendingMsg += `*#${p.id}* | ${p.amount} ETB | ${p.provider}\n`;
        pendingMsg += `User: @${user?.username || user?.firstName || p.userId}\n`;
        pendingMsg += `Time: ${new Date(p.submittedAt).toLocaleString()}\n`;
        pendingMsg += `/view ${p.id} | /approve ${p.id} | /reject ${p.id}\n\n`;
      });
      bot.sendMessage(chatId, pendingMsg, { parse_mode: 'Markdown' });
      break;
      
    case 'view':
      if (!args) {
        bot.sendMessage(chatId, '❌ Usage: /view <payment_id>');
        return;
      }
      
      const viewId = parseInt(args);
      const payment = db.getPayment(viewId);
      if (!payment) {
        bot.sendMessage(chatId, `❌ Payment #${viewId} not found.`);
        return;
      }
      
      const userForView = db.getUser(payment.userId);
      const viewMsg = `
📋 *Payment Details - #${payment.id}*

*User:* ${userForView?.firstName} ${userForView?.lastName || ''}
*Username:* @${userForView?.username || 'N/A'}
*Phone:* ${userForView?.phone || 'Not provided'}
*Amount:* ${payment.amount} ETB
*Provider:* ${payment.provider}
*Status:* ${payment.status}
*Submitted:* ${new Date(payment.submittedAt).toLocaleString()}

*Account Details:*
${JSON.stringify(payment.accountDetails, null, 2)}
      `;
      bot.sendMessage(chatId, viewMsg, { parse_mode: 'Markdown' });
      
      if (payment.receiptFileId) {
        bot.sendPhoto(chatId, payment.receiptFileId, { 
          caption: `Receipt for payment #${payment.id}\nCaption: ${payment.receiptCaption || 'No caption'}` 
        });
      }
      break;
      
    case 'payments':
      const allPayments = db.getAllPayments(20);
      if (allPayments.length === 0) {
        bot.sendMessage(chatId, '📭 No payments found.');
        return;
      }
      
      let allMsg = `📊 *Recent Payments (Last ${allPayments.length})*\n\n`;
      allPayments.forEach(p => {
        const statusEmoji = p.status === 'approved' ? '✅' : p.status === 'rejected' ? '❌' : '⏳';
        allMsg += `${statusEmoji} #${p.id} | ${p.amount} ETB | ${p.status}\n`;
      });
      allMsg += `\nUse /pending to see pending verifications.`;
      bot.sendMessage(chatId, allMsg, { parse_mode: 'Markdown' });
      break;
      
    case 'stats':
      const allPaymentsStats = db.getAllPayments(1000);
      
      // FIXED: Use different variable names to avoid duplication
      const totalApproved = allPaymentsStats.filter(p => p.status === 'approved');
      const totalPending = allPaymentsStats.filter(p => p.status === 'waiting_verification');
      const totalRejected = allPaymentsStats.filter(p => p.status === 'rejected');
      const totalAmountReceived = totalApproved.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
      const statsMsg = `
📈 *Bot Statistics*

*Total Payments:* ${allPaymentsStats.length}
*Approved:* ${totalApproved.length}
*Pending Verification:* ${totalPending.length}
*Rejected:* ${totalRejected.length}

*Total Revenue:* ${totalAmountReceived.toLocaleString()} ETB
      `;
      bot.sendMessage(chatId, statsMsg, { parse_mode: 'Markdown' });
      break;
      
    default:
      bot.sendMessage(chatId, '❌ Unknown admin command. Available: /approve, /reject, /pending, /payments, /view, /stats');
  }
}

module.exports = { handleAdminCommand };
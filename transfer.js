import { Client, AccountId, PrivateKey, TransferTransaction, Hbar, AccountBalanceQuery } from "@hiero-ledger/sdk"

async function main() {
  // Account details
  const senderAccountId = AccountId.fromString("0.0.1021");
  const receiverAccountId = AccountId.fromString("0.0.1020");

  // Create private key from the provided ECDSA private key
  const privateKey = PrivateKey.fromStringECDSA("0xeae4e00ece872dd14fb6dc7a04f390563c7d69d16326f2a703ec8e0934060cc7");

  // Create a client instance
  const client = Client.forLocalNode();

  // Set the operator with the sender account ID and private key
  client.setOperator(senderAccountId, privateKey);

  try {
    // Query balance for sender account before transfer
    console.log(`Checking balance for account ${senderAccountId.toString()}...`);
    const balanceQuery = new AccountBalanceQuery()
      .setAccountId(senderAccountId);

    const accountBalance = await balanceQuery.execute(client);
    console.log(`Account ${senderAccountId.toString()} balance before transfer: ${accountBalance.hbars.toString()}`);

    // Create the transfer transaction
    const transaction = new TransferTransaction()
      .addHbarTransfer(senderAccountId, new Hbar(-9000)) // Sending 10 Hbar
      .addHbarTransfer(receiverAccountId, new Hbar(9000)) // Receiving 10 Hbar
      .freezeWith(client);

    // Sign the transaction with the sender's private key
    const signedTx = await transaction.sign(privateKey);

    // Submit the transaction to the network
    const txResponse = await signedTx.execute(client);

    // Get the receipt to ensure successful execution
    const receipt = await txResponse.getReceipt(client);

    console.log(`Transaction status: ${receipt.status.toString()}`);
    console.log(`Transaction ID: ${txResponse.transactionId.toString()}`);
    console.log(`Successfully transferred 10 Hbar from ${senderAccountId.toString()} to ${receiverAccountId.toString()}`);

    {
      // Query balance for sender account after transfer
      console.log(`Checking balance for account ${senderAccountId.toString()}...`);
      const balanceQuery = new AccountBalanceQuery()
        .setAccountId(senderAccountId);

      const accountBalance = await balanceQuery.execute(client);
      console.log(`Account ${senderAccountId.toString()} balance after transfer: ${accountBalance.hbars.toString()}`);
    }
  } catch (error) {
    console.error(`Error occurred: ${error.message}`);
  } finally {
    // Close the client
    client.close();
  }
}

// Execute the main function and handle any errors
main()
  .catch(error => console.error(`Unhandled error: ${error.message}`));

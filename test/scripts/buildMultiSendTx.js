const ERC721JSON = require("../../artifacts/contracts/NFT/Catgirl.sol/Catgirl.json");
const MULTISENDJSON = require("../../artifacts/contracts/marketplace/MultiSend.sol/MultiSend.json"); 
const ethers = require('ethers');

const buildMultiSendTx = (
    from,
    to,
    target,
    tokenIds
) => {
  const multiSendInterface = new ethers.Interface(MULTISENDJSON.abi);
  const erc721Interface = new ethers.Interface(ERC721JSON.abi);

  let callDataEncoded = "";
  let replacementPattern = "0x" + "0".repeat(136);

  for (let i = 0; i < tokenIds.length; i++) {
    const transferEncoded = erc721Interface.encodeFunctionData("transferFrom", [
      from,
      to,
      tokenIds[i]
    ]).substring(2);

    if (i == 0) {
      callDataEncoded +=  `0x00` + `${target.substring(2)}` + '0000000000000000000000000000000000000000000000000000000000000000'
          + Number(transferEncoded.length / 2).toString(16).padStart(64, "0") + transferEncoded
    } else {
      callDataEncoded +=  `00` + `${target.substring(2)}` + '0000000000000000000000000000000000000000000000000000000000000000'
          + Number(transferEncoded.length / 2).toString(16).padStart(64, "0") + transferEncoded
    }

    replacementPattern += `00` + `${to.substring(2)}` + '0000000000000000000000000000000000000000000000000000000000000000'
        + "0".repeat(Number(transferEncoded.length / 2).toString(16).padStart(64, "0").length) + "0".repeat(72) + "f".repeat(64) + "0".repeat(transferEncoded.substring(136).length);
  }

  let multiSendEncoded = multiSendInterface.encodeFunctionData("multiSend", [
    callDataEncoded
  ]);

  if (replacementPattern.length < multiSendEncoded.length) {
    replacementPattern += "0".repeat(multiSendEncoded.length - replacementPattern.length);
  }

  return {
    multiSendEncoded,
    sellReplacementPattern: replacementPattern
  }
}

const buildMultiBuyPattern = (
    from,
    to,
    target,
    tokenIds
) => {
  const multiSendInterface = new ethers.Interface(MULTISENDJSON.abi);
  const erc721Interface = new ethers.Interface(ERC721JSON.abi);

  let callDataEncoded = "";
  let replacementPattern = "0x" + "0".repeat(136);

  for (let i = 0; i < tokenIds.length; i++) {
    const transferEncoded = erc721Interface.encodeFunctionData("transferFrom", [
      from,
      to,
      tokenIds[i]
    ]).substring(2);

    if (i == 0) {
      callDataEncoded +=  `0x00` + `${target.substring(2)}` + '0000000000000000000000000000000000000000000000000000000000000000'
          + Number(transferEncoded.length / 2).toString(16).padStart(64, "0") + transferEncoded
    } else {
      callDataEncoded +=  `00` + `${target.substring(2)}` + '0000000000000000000000000000000000000000000000000000000000000000'
          + Number(transferEncoded.length / 2).toString(16).padStart(64, "0") + transferEncoded
    }

    replacementPattern += `00` + `${from.substring(2)}` + '0000000000000000000000000000000000000000000000000000000000000000'
        + "0".repeat(Number(transferEncoded.length / 2).toString(16).padStart(64, "0").length) + "0".repeat(8) + "f".repeat(64) + "0".repeat(transferEncoded.substring(72).length);
  }

  let multiSendEncoded = multiSendInterface.encodeFunctionData("multiSend", [
    callDataEncoded
  ]);

  if (replacementPattern.length < multiSendEncoded.length) {
    replacementPattern += "0".repeat(multiSendEncoded.length - replacementPattern.length);
  }

  return {
    buyMultiSendEncoded: multiSendEncoded,
    buyReplacementPattern: replacementPattern
  }
}

module.exports = {
  buildMultiBuyPattern,
  buildMultiSendTx
}
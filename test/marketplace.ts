import { expect } from "chai";

import { network, upgrades } from "hardhat";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ERC721JSON = require("../artifacts/contracts/NFT/Catgirl.sol/Catgirl.json");
const {
  buildMultiBuyPattern,
  buildMultiSendTx,
} = require("./scripts/buildMultiSendTx.js");

const VERIFY_CONTRACT_NAME = "NyaMarketplace";
const CONTRACT_VERSION = "1.0.0";
const CHAINID = 1337;

function expandTo18Decimals(n: number, p = 18) {
  return ethers.parseUnits(n.toString(), p).toString();
}

function getDefaultHashOrderArr(currentTime: number) {
  return [expandTo18Decimals(1), currentTime, currentTime + 50000000000000, 111];
}

function getDefaultMatchArr(currentTime: number) {
  return [
    expandTo18Decimals(1),
    currentTime,
    currentTime + 50000000000000,
    111,
    expandTo18Decimals(1),
    currentTime,
    currentTime + 50000000000000,
    111,
  ]
}

async function signHashOrder(target: any, hash: string, exchangeAddress: any) {
  return await target.signTypedData(
    {
      name: VERIFY_CONTRACT_NAME,
      version: CONTRACT_VERSION,
      chainId: CHAINID,
      verifyingContract: exchangeAddress,
    },
    {
      HashOrder: [{ name: "orderHash", type: "bytes32" }],
    },
    {
      orderHash: hash,
    }
  );
}

const DEFAULT_ENCODE_SELLER = '0x000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000';
const DEFAULT_ENCODE_BUYER = '0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

describe("Cat girl Marketplace", function () {

  let exchange: any;
  let maker: any;;
  let taker: any;
  let protocolFee: any;
  let merchant: any;
  let paymentToken: any;
  let erc721: any;
  let multiSend: any;
  let owner: any;
  let newProtocol;
  let anotherAcc: any;
  let exchangeAddress: any;
  let erc721Address: any;
  let paymentAddress: any;
  let proxyRegistry: any;
  let proxyRegistryAddress: any;
  let multisendAddress: any;
  let victim: any;

  let makerAddress: any;
  let takerAddress: any;
  let victimAddress: any;
  beforeEach(async () => {
    [maker, taker, merchant, protocolFee, owner, newProtocol, anotherAcc, victim] =
      await ethers.getSigners();
    makerAddress = await maker.getAddress();
    takerAddress = await taker.getAddress();
    victimAddress = await victim.getAddress();
    // await network.provider.request({
    //     method: "hardhat_impersonateAccount",
    //     params: [WHALE_ADDRESS],
    // });
    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    paymentToken = await MockTokenFactory.deploy();
    console.log(paymentAddress);
    paymentAddress = await paymentToken.getAddress()
    console.log('paymenttoke', paymentAddress);
    const MockExchange = await ethers.getContractFactory("NyaExchange");
    exchange = await upgrades.deployProxy(MockExchange.connect(owner), [owner.address, paymentAddress], {
      kind: "uups",
    });

    const proxyRegistryFactory = await ethers.getContractFactory("NyaProxyRegistry");
    proxyRegistry = await proxyRegistryFactory.deploy(owner.address);
    proxyRegistryAddress = await proxyRegistry.getAddress();
    const NFTFactory = await ethers.getContractFactory("Catgirl");
    erc721 = await upgrades.deployProxy(NFTFactory, [owner.address], { kind: "uups" });
    
    await exchange.setProxyRegistry(proxyRegistryAddress);
    const MockMultisend = await ethers.getContractFactory("MultiSend");
    multiSend = await MockMultisend.deploy();
    multisendAddress = await multiSend.getAddress();

    await erc721.connect(owner).externalMint(maker.address, 1, 100, 1, 0);
    await erc721.connect(owner).externalMint(maker.address, 1, 50, 1, 0);
    await erc721.connect(owner).externalMint(maker.address, 1, 100, 1, 0);
    await erc721.connect(owner).externalMint(maker.address, 1, 50, 1, 0);
    await erc721.connect(owner).externalMint(maker.address, 1, 100, 1, 0);
    await erc721.connect(owner).externalMint(maker.address, 1, 50, 1, 0);
    await erc721.connect(owner).externalMint(victim.address, 1, 50, 1, 0);
    console.log('done mint')
    await paymentToken.transfer(
      await taker.getAddress(),
      expandTo18Decimals(1000)
    );
    exchangeAddress = await exchange.getAddress();
    await paymentToken
      .connect(taker)
      .approve(exchangeAddress, expandTo18Decimals(1000));
    await paymentToken.approve(exchangeAddress, expandTo18Decimals(1000));
    erc721Address = await erc721.getAddress();

    // register proxy
    await proxyRegistry.connect(taker).registerProxy();
    await proxyRegistry.connect(maker).registerProxy();
    await proxyRegistry.connect(owner).startGrantAuthentication(exchangeAddress);
    const currentTime = await time.latest();
    console.log({currentTime})
    await time.increaseTo((currentTime + 86401));

    await proxyRegistry.connect(owner).endGrantAuthentication(exchangeAddress);
    const res = await upgrades.validateUpgrade(exchangeAddress, MockExchange);
    console.log('is validate', res);
  });

  it("only upgrader can upgrade", async function () {
    const NyaExchangeFactory =
      await ethers.getContractFactory("NyaExchange", { signer: owner });
    const newProxyAddress = await upgrades.upgradeProxy(
      exchangeAddress,
      NyaExchangeFactory
    );
    console.log('able to upgrade', newProxyAddress);
  });
  it("Only owner can change maker fee", async () => {
    await expect(
      exchange.connect(owner).setMakerFee(6000000)
    ).to.be.revertedWith("Maker fee should be lower than maximum fee!");
    await exchange.connect(owner).setMakerFee(300);
    const newMakerFee = await exchange.MAKER_RELAYER_FEE();
    expect(newMakerFee.toString()).to.be.equals("300");
    await expect(exchange.connect(maker).setMakerFee(300)).to.be.reverted;
  });

  it("Only owner can change taker fee", async () => {
    await expect(
      exchange.connect(owner).setTakerFee(6000000)
    ).to.be.revertedWith("Taker fee should be lower than maximum fee!");
    await exchange.connect(owner).setTakerFee(300);
    const newTakerFee = await exchange.TAKER_RELAYER_FEE();
    expect(newTakerFee.toString()).to.be.equals("300");

    await expect(exchange.connect(maker).setTakerFee(300)).to.be.reverted;
  });

  // maker and taker are attackers try to steal ERC20 from victim when victim approved exchange
  it("Can not use victim approval ERC20, use calldata will fail", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 10000);
      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(maker.address), true);
      // Victim approve Exchange contract
      await paymentToken.connect(victim).approve(exchangeAddress, expandTo18Decimals(10000000));
      const ownerNft1 = await erc721.ownerOf(1);
      console.log(ownerNft1, makerAddress, takerAddress);

      const iface = new ethers.Interface(ERC721JSON.abi);

      // Gen call data to transfer token from victim to maker
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        victimAddress,
        makerAddress,
        "100",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        victimAddress,
        makerAddress,
        "100",
      ]);
      const makerhashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          paymentAddress, // target is token address
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        DEFAULT_ENCODE_SELLER
      );

      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);
      let sig = ethers.Signature.from(signedMessage);


      await expect(exchange
        .connect(taker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            makerAddress,
            ethers.ZeroAddress,
            paymentAddress,// target is token address
            paymentAddress,
            exchangeAddress,
            makerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            paymentAddress,// target is token address
            paymentAddress,
          ],
          getDefaultMatchArr(currentTime),
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )).to.be.revertedWith("NYA_Exchange::ERC721 Transfer failed!");
    }
  });

  // maker and taker are attackers try to steal nft from victim
  it("Can not use victim approval ERC721, use calldata will fail", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 10000);
      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(maker.address), true);
      // Victim approve victim's proxy
      await proxyRegistry.connect(victim).registerProxy()
      await erc721.connect(victim).setApprovalForAll(await proxyRegistry.proxies(victimAddress), true);
      // Victim accidenly approve exchange
      await erc721.connect(victim).setApprovalForAll(exchangeAddress, true);

      // Check info
      const ownerNft6 = await erc721.ownerOf(6);

      console.log('owner token 6', ownerNft6, victimAddress);

      const iface = new ethers.Interface(ERC721JSON.abi);
      // Encod function transfer nft from victim to maker
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        victimAddress,
        makerAddress,
        "6",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        victimAddress,
        makerAddress,
        "6",
      ]);
      const makerhashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        DEFAULT_ENCODE_SELLER
      );

      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);
      let sig = ethers.Signature.from(signedMessage);

      await expect(exchange
        .connect(taker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            makerAddress,
            ethers.ZeroAddress,
            erc721Address,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
          ],
          getDefaultMatchArr(currentTime),
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )).to.be.revertedWith("NYA_Exchange::ERC721 Transfer failed!");
    }
  });

  it("Seller able to sell NFT through Fixed-Price", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      await exchange.setMakerFee(0);
      await exchange.setTakerFee(250);
      const currentTime = Math.floor(Date.now() / 10000);

      const iface = new ethers.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.ZeroAddress,
        "1",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "1",
      ]);
      const makerhashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        DEFAULT_ENCODE_SELLER
      );

      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);
      const hashed = await exchange.HASH_ORDER_TYPEHASH();
      console.log({ hashed, signedMessage });
      // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

      // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

      let sig = ethers.Signature.from(signedMessage);
      // let takerSig = ethers.Signature.from(takerSignedMessage);

      // CAN NOT BUY NFT WHEN MAKER NOT APPROVE HIS PROXY
      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              exchangeAddress,
              takerAddress,
              makerAddress,
              ethers.ZeroAddress,
              erc721Address,
              paymentAddress,
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              paymentAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            DEFAULT_ENCODE_SELLER,
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s]
          )
      ).to.be.revertedWith("NYA_Exchange::ERC721 Transfer failed!");

      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(maker.address), true);
      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              exchangeAddress,
              takerAddress,
              makerAddress,
              ethers.ZeroAddress,
              erc721Address,
              paymentAddress,
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              paymentAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            DEFAULT_ENCODE_SELLER,
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s],
            { value: "1111" }
          )
      ).to.be.revertedWith("NYA_Exchange::Redundant sent funds!");

      await exchange
        .connect(taker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            makerAddress,
            ethers.ZeroAddress,
            erc721Address,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
          ],
          getDefaultMatchArr(currentTime),
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        );
      const newOwner = await erc721.ownerOf(1);
      expect(newOwner === maker, "Maker has NFT");
      await exchange.setMakerFee(250);
      await exchange.setTakerFee(0);
    }
  });

  it("Wrong replacement with fixed price", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 10000);

      const iface = new ethers.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.ZeroAddress,
        "1",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "1",
      ]);

      const makerhashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        "0x"
      );

      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);
      let sig = ethers.Signature.from(signedMessage);

      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              exchangeAddress,
              takerAddress,
              makerAddress,
              ethers.ZeroAddress,
              erc721Address,
              paymentAddress,
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              paymentAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            "0x",
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s]
          )
      ).to.be.revertedWith(
        "NYA_Exchange::Calldata after replacement is invalid!"
      );
    }
  });

  it("Wrong replacement with NFT auction", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const iface = new ethers.Interface(ERC721JSON.abi);

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);

    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 500000000000001, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      "0x"
    );

    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);
    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            erc721Address,
            paymentAddress,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
          ],
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          "0x",
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )
    ).to.be.revertedWith(
      "NYA_Exchange::Calldata after replacement is invalid!"
    );
  });

  it("Can not sell nft when maker does not have nft", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      await erc721.connect(maker).setApprovalForAll(exchangeAddress, false);
      const currentTime = Math.floor(Date.now() / 10000);
      const iface = new ethers.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.ZeroAddress,
        "111",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "111",
      ]);

      const makerhashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        DEFAULT_ENCODE_SELLER
      );

      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);
      const hashed = await exchange.HASH_ORDER_TYPEHASH();
      console.log({ hashed });

      let sig = ethers.Signature.from(signedMessage);

      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              exchangeAddress,
              takerAddress,
              makerAddress,
              ethers.ZeroAddress,
              erc721Address,
              paymentAddress,
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              paymentAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            DEFAULT_ENCODE_SELLER,
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s]
          )
      ).to.be.revertedWith("NYA_Exchange::ERC721 Transfer failed!");
    }
  });

  it("Buy single NFT fixed price by BNB", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 10000);

      const iface = new ethers.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.ZeroAddress,
        "1",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "1",
      ]);
      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(maker.address), true);
      const makerhashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          ethers.ZeroAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        DEFAULT_ENCODE_SELLER
      );
      // const hashOrderMessage = Buffer.from(makerhashOrder.slice(2), "hex");
      // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);
      const hashed = await exchange.HASH_ORDER_TYPEHASH();
      console.log({ hashed });
      // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

      // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

      let sig = ethers.Signature.from(signedMessage);
      // let takerSig = ethers.Signature.from(takerSignedMessage);

      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              exchangeAddress,
              takerAddress,
              makerAddress,
              ethers.ZeroAddress,
              erc721Address,
              ethers.ZeroAddress,
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              ethers.ZeroAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            DEFAULT_ENCODE_SELLER,
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s],
            { value: "11111111" }
          )
      ).to.be.revertedWith("NYA_Exchange::Fee transfer to maker failed!");

      // Enough to pay fee but not for order
      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              exchangeAddress,
              takerAddress,
              makerAddress,
              ethers.ZeroAddress,
              erc721Address,
              ethers.ZeroAddress,
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              ethers.ZeroAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            DEFAULT_ENCODE_SELLER,
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s],
            { value: "100000000000000000" }
          )
      ).to.be.revertedWith("Required sent ether amount is not enough");

      await exchange
        .connect(taker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            makerAddress,
            ethers.ZeroAddress,
            erc721Address,
            ethers.ZeroAddress,
            exchangeAddress,
            makerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            ethers.ZeroAddress,
          ],
          getDefaultMatchArr(currentTime),
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s],
          { value: expandTo18Decimals(1) }
        );
      const newOwner = await erc721.ownerOf(1);
      expect(newOwner === maker, "Maker has NFT");
    }
  });

  it("Transfer fee to taker fail", async () => {
    await exchange.setMakerFee(0);
    await exchange.setTakerFee(250);
    const currentTime = Math.floor(Date.now() / 10000);

    const iface = new ethers.Interface(ERC721JSON.abi);
    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      ethers.ZeroAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);
    await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(maker.address), true);
    const makerhashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        makerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        ethers.ZeroAddress,
      ],
      getDefaultHashOrderArr(currentTime),
      1,
      0,
      0,
      callDataEncoded,
      DEFAULT_ENCODE_SELLER
    );
    // const hashOrderMessage = Buffer.from(makerhashOrder.slice(2), "hex");
    // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
    const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);
    const hashed = await exchange.HASH_ORDER_TYPEHASH();
    console.log({ hashed });
    // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

    // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

    let sig = ethers.Signature.from(signedMessage);
    // let takerSig = ethers.Signature.from(takerSignedMessage);

    await expect(
      exchange
        .connect(taker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            makerAddress,
            ethers.ZeroAddress,
            erc721Address,
            ethers.ZeroAddress,
            exchangeAddress,
            makerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            ethers.ZeroAddress,
          ],
          getDefaultMatchArr(currentTime),
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s],
          { value: "11111111" }
        )
    ).to.be.revertedWith("NYA_Exchange::Fee transfer to taker failed!");

    await exchange
      .connect(taker)
      .atomicMatch_(
        [
          exchangeAddress,
          takerAddress,
          makerAddress,
          ethers.ZeroAddress,
          erc721Address,
          ethers.ZeroAddress,
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          ethers.ZeroAddress,
        ],
        getDefaultMatchArr(currentTime),
        [0, 0, 0, 1, 0, 0],
        callDataEncodedBuyer,
        callDataEncoded,
        DEFAULT_ENCODE_BUYER,
        DEFAULT_ENCODE_SELLER,
        [sig.v, sig.v],
        [sig.r, sig.s, sig.r, sig.s],
        { value: expandTo18Decimals(11) }
      );
    await exchange.setMakerFee(250);
    await exchange.setTakerFee(0);
  });

  it("Wrong order params for fixed price", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 10000);

      const iface = new ethers.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.ZeroAddress,
        "1",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "1",
      ]);

      const makerhashOrder = await exchange.hashOrder_(
        [
          anotherAcc.address,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          ethers.ZeroAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        DEFAULT_ENCODE_SELLER
      );
      // const hashOrderMessage = Buffer.from(makerhashOrder.slice(2), "hex");
      // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);
      const hashed = await exchange.HASH_ORDER_TYPEHASH();
      console.log({ hashed });
      // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

      // console.log("MAKER SIGNED MESSAGE: " + signedMessage);
      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(maker.address), true);
      let sig = ethers.Signature.from(signedMessage);
      // let takerSig = ethers.Signature.from(takerSignedMessage);
      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              anotherAcc.address,
              takerAddress,
              makerAddress,
              ethers.ZeroAddress,
              erc721Address,
              ethers.ZeroAddress,
              anotherAcc.address,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              ethers.ZeroAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            DEFAULT_ENCODE_SELLER,
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s],
            { value: expandTo18Decimals(1) }
          )
      ).to.be.revertedWith("NYA_Exchange::Invalid buy order params!");
    }
  });

  it("Wrong order params for NFT auction", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const iface = new ethers.Interface(ERC721JSON.abi);

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);

    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 500000000000001, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );

    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);

    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
            anotherAcc.address,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            erc721Address,
            paymentAddress,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
          ],
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )
    ).to.be.revertedWith("NYA_Exchange::Invalid sell order params!");
  });

  it("Target must be contract", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const iface = new ethers.Interface(ERC721JSON.abi);

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);

    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        anotherAcc.address,
        paymentAddress,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 500000000000001, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );

    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);

    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            anotherAcc.address,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            anotherAcc.address,
            paymentAddress,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
          ],
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )
    ).to.be.revertedWith("NYA_Exchange::Order target is not a contract!");
  });

  it("Auction does not have expiration date & wrong signature would return err", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const iface = new ethers.Interface(ERC721JSON.abi);

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);

    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      [expandTo18Decimals(1), currentTime, 0, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );

    const wrongtakerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        ethers.ZeroAddress,
      ],
      [expandTo18Decimals(1), currentTime, 0, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );

    console.log("HASH ORDER: " + takerHashOrder);
    
    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    const wrongSignedMessage = await signHashOrder(taker, wrongtakerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);
    let wrongSig = ethers.Signature.from(wrongSignedMessage);

    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            erc721Address,
            paymentAddress,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            0,
            111,
            expandTo18Decimals(1),
            currentTime,
            0,
            111,
          ],
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [wrongSig.v, wrongSig.v],
          [wrongSig.r, wrongSig.s, wrongSig.r, wrongSig.s]
        )
    ).to.be.revertedWith("Invalid Order Hash or already cancelled!");

    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            erc721Address,
            paymentAddress,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            0,
            111,
            expandTo18Decimals(1),
            currentTime,
            0,
            111,
          ],
          [0, 1, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )
    ).to.be.revertedWith("Invalid Order Hash or already cancelled!");
  });

  it("Buyer able to make an offer to a single NFT auction", async () => {
    const currentTime = Math.floor(Date.now() / 1000);

    const iface = new ethers.Interface(ERC721JSON.abi);

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);

    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 500000000000001, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );
    const takerHashOrderWithlessPrice = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      ["1111111111111111", currentTime, currentTime + 500000000000001, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );
    console.log("HASH ORDER: " + takerHashOrder);

    // const hashOrderMessage = Buffer.from(takerHashOrder.slice(2), "hex");
    // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
    // const signedMessage = await taker.signMessage(hashOrderMessage);

    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);

    const signedMessageWithLessPrice = await taker.signTypedData(
      {
        name: VERIFY_CONTRACT_NAME,
        version: CONTRACT_VERSION,
        chainId: CHAINID,
        verifyingContract: exchangeAddress,
      },
      {
        HashOrder: [{ name: "orderHash", type: "bytes32" }],
      },
      {
        orderHash: takerHashOrderWithlessPrice,
      }
    );

    let sigWithLessPrice = ethers.Signature.from(
      signedMessageWithLessPrice
    );
    await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(maker.address), true);
    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            erc721Address,
            paymentAddress,
          ],
          [
            "1111111111111111",
            currentTime,
            currentTime + 500000000000001,
            111,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
          ],
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sigWithLessPrice.v, sigWithLessPrice.v],
          [
            sigWithLessPrice.r,
            sigWithLessPrice.s,
            sigWithLessPrice.r,
            sigWithLessPrice.s,
          ]
        )
    ).to.be.revertedWith(
      "NYA_Exchange::Buy price must greater than sell price!"
    );

    await exchange
      .connect(maker)
      .atomicMatch_(
        [
          exchangeAddress,
          takerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
          exchangeAddress,
          makerAddress,
          takerAddress,
          ethers.ZeroAddress,
          erc721Address,
          paymentAddress,
        ],
        [
          expandTo18Decimals(1),
          currentTime,
          currentTime + 500000000000001,
          111,
          expandTo18Decimals(1),
          currentTime,
          currentTime + 500000000000001,
          111,
        ],
        [0, 0, 0, 1, 0, 0],
        callDataEncodedBuyer,
        callDataEncoded,
        DEFAULT_ENCODE_BUYER,
        DEFAULT_ENCODE_SELLER,
        [sig.v, sig.v],
        [sig.r, sig.s, sig.r, sig.s]
      );

    const newOwner = await erc721.ownerOf("1");
    expect(newOwner).to.be.equals(await taker.getAddress());
  });

  it("Buyer able to make an offer to a single NFT auction when taker pay the fee", async () => {
    await exchange.setMakerFee(0);
    await exchange.setTakerFee(250);
    const currentTime = Math.floor(Date.now() / 1000)


    const iface = new ethers.Interface(ERC721JSON.abi);

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);
    await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(maker.address), true);
    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 500000000000001, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );
    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);

    await exchange
      .connect(maker)
      .atomicMatch_(
        [
          exchangeAddress,
          takerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
          exchangeAddress,
          makerAddress,
          takerAddress,
          ethers.ZeroAddress,
          erc721Address,
          paymentAddress,
        ],
        [
          expandTo18Decimals(1),
          currentTime,
          currentTime + 500000000000001,
          111,
          expandTo18Decimals(1),
          currentTime,
          currentTime + 500000000000001,
          111,
        ],
        [0, 0, 0, 1, 0, 0],
        callDataEncodedBuyer,
        callDataEncoded,
        DEFAULT_ENCODE_BUYER,
        DEFAULT_ENCODE_SELLER,
        [sig.v, sig.v],
        [sig.r, sig.s, sig.r, sig.s]
      );

    const newOwner = await erc721.ownerOf("1");
    expect(newOwner).to.be.equals(await taker.getAddress());
    await exchange.setMakerFee(250);
    await exchange.setTakerFee(0);
  });

  it("Can not match bid with BNB payment", async () => {
    const currentTime = Math.floor(Date.now() / 1000);

    const iface = new ethers.Interface(ERC721JSON.abi);

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);
    await erc721.connect(taker).setApprovalForAll(await proxyRegistry.proxies(takerAddress), true);
    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        ethers.ZeroAddress,
      ],
      [expandTo18Decimals(1), currentTime, currentTime + 500000000000001, 111],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );
    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);

    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            ethers.ZeroAddress,
            exchangeAddress,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            erc721Address,
            ethers.ZeroAddress,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
            expandTo18Decimals(1),
            currentTime,
            currentTime + 500000000000001,
            111,
          ],
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )
    ).to.be.rejectedWith();
  });

  it("Seller able to sell bundle NFTs through Fixed-Price", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 1000);
      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(makerAddress), true);
      const { multiSendEncoded, sellReplacementPattern } = buildMultiSendTx(
        makerAddress,
        ethers.ZeroAddress,
        erc721Address,
        ["1", "2", "3", "4"]
      );

      const { buyMultiSendEncoded, buyReplacementPattern } =
        buildMultiBuyPattern(makerAddress, takerAddress, erc721Address, [
          "1",
          "2",
          "3",
          "4",
        ]);

      const makerhashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          multisendAddress,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        1,
        multiSendEncoded,
        sellReplacementPattern
      );

      const canBeMatched = await exchange.ordersCanMatch_(
        [
          exchangeAddress,
          takerAddress,
          makerAddress,
          ethers.ZeroAddress,
          multisendAddress,
          paymentAddress,
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          multisendAddress,
          paymentAddress,
        ],
        getDefaultMatchArr(currentTime),
        [0, 0, 1, 1, 0, 1],
        buyMultiSendEncoded,
        multiSendEncoded,
        buyReplacementPattern,
        sellReplacementPattern
      );

      console.log("CAN BE MATCHED: " + canBeMatched);

      console.log("HASH ORDER: " + makerhashOrder);

      // const hashOrderMessage = Buffer.from(makerhashOrder.slice(2), "hex");
      // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
      // const signedMessage = await maker.signMessage(hashOrderMessage);
      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);

      // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

      // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

      let sig = ethers.Signature.from(signedMessage);
      // let takerSig = ethers.Signature.from(takerSignedMessage);
       
      const takerBalanceBefore = await paymentToken.balanceOf(takerAddress);
      console.log("TAKER BALANCE BEFORE: " + takerBalanceBefore.toString());

      const makerBalanceBefore = await paymentToken.balanceOf(makerAddress);
      console.log("Maker BALANCE BEFORE: " + makerBalanceBefore.toString());
      await exchange
        .connect(taker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            makerAddress,
            ethers.ZeroAddress,
            multisendAddress,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            multisendAddress,
            paymentAddress,
          ],
          getDefaultMatchArr(currentTime),
          [0, 0, 1, 1, 0, 1],
          buyMultiSendEncoded,
          multiSendEncoded,
          buyReplacementPattern,
          sellReplacementPattern,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        );

      const newOwner = await erc721.ownerOf("1");
      expect(newOwner).to.be.equals(takerAddress);

      const newOwner2 = await erc721.ownerOf("2");
      expect(newOwner2).to.be.equals(takerAddress);

      const newOwner3 = await erc721.ownerOf("3");
      expect(newOwner3).to.be.equals(takerAddress);

      const balanceOf = await paymentToken.balanceOf(await protocolFee.getAddress());
      console.log("PROTOCOL FEE BALANCE: " + balanceOf.toString());
      
      const takerBalance = await paymentToken.balanceOf(takerAddress);
      console.log("TAKER BALANCE: " + takerBalance.toString());

      const makerBalance = await paymentToken.balanceOf(makerAddress);
      console.log("Maker BALANCE: " + makerBalance.toString());
      
      // expect(balanceOf).to.be.equals("25000000000000000");
    }
  });

  it("Catgirl's system auto matches 2 orders when reserved price is reached", async () => {
    const currentTime = Math.floor(Date.now() / 1000 - 120);
    const iface = new ethers.Interface(ERC721JSON.abi);
    await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(makerAddress), true);
    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      ethers.ZeroAddress,
      "1",
    ]);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);
    // const blockNumBefore = await ethers.provider.getBlockNumber();

    // const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    // const timestampBefore = blockBefore.timestamp;
    //   console.log('XXX',  currentTime, timestampBefore.toString());
    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      [
        // 250,
        // 250,
        expandTo18Decimals(2),
        currentTime,
        currentTime + 50000000,
        111,
      ],
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );

    const makerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        makerAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        erc721Address,
        paymentAddress,
      ],
      [
        // 250,
        // 250,
        expandTo18Decimals(1),
        currentTime,
        currentTime + 50000000,
        111,
      ],
      1,
      0,
      0,
      callDataEncoded,
      DEFAULT_ENCODE_SELLER
    );

    const canBeMatched = await exchange.ordersCanMatch_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
        exchangeAddress,
        makerAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        erc721Address,
        paymentAddress,
      ],
      [
        // 250,
        // 250,
        expandTo18Decimals(2),
        currentTime,
        currentTime + 50000000,
        111,
        // 250,
        // 250,
        expandTo18Decimals(1),
        currentTime,
        currentTime + 50000000,
        111,
      ],
      [0, 0, 0, 1, 0, 0],
      callDataEncodedBuyer,
      callDataEncoded,
      DEFAULT_ENCODE_BUYER,
      DEFAULT_ENCODE_SELLER
    );

    console.log("CAN BE MATCHED: " + canBeMatched);

    console.log("HASH ORDER: " + takerHashOrder);


    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    // const makerSignedMessage = await maker.signMessage(makerHashOrderMessage);

    const makerSignedMessage = await signHashOrder(maker, makerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);
    let makerSig = ethers.Signature.from(makerSignedMessage);

    await expect(
      exchange.connect(merchant).atomicMatch_(
        [
          exchangeAddress,
          takerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          erc721Address,
          paymentAddress,
        ],
        [
          // 250,
          // 250,
          expandTo18Decimals(2),
          currentTime,
          currentTime + 50000000,
          111,
          // 250,
          // 250,
          expandTo18Decimals(1),
          currentTime,
          currentTime + 50000000,
          111,
        ],
        [0, 0, 0, 1, 0, 0],
        callDataEncodedBuyer,
        callDataEncoded,
        DEFAULT_ENCODE_BUYER,
        DEFAULT_ENCODE_SELLER,
        [sig.v, makerSig.v],
        [sig.r, sig.s, makerSig.r, makerSig.s]
      )
    ).to.be.emit(exchange, "OrdersMatched");

    const newOwner = await erc721.ownerOf("1");
    expect(newOwner).to.be.equals(await taker.getAddress());
  });

  it("Seller able to sell multiple NFTs through Auction", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 1000);

      const { multiSendEncoded, sellReplacementPattern } = buildMultiSendTx(
        makerAddress,
        takerAddress,
        erc721Address,
        ["1", "2", "3", "4"]
      );
      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(makerAddress), true);
      const { buyMultiSendEncoded, buyReplacementPattern } =
        buildMultiBuyPattern(
          ethers.ZeroAddress,
          takerAddress,
          erc721Address,
          ["1", "2", "3", "4"]
        );

      const takerHashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          takerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          multisendAddress,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        0,
        0,
        1,
        buyMultiSendEncoded,
        buyReplacementPattern
      );
      const canBeMatched = await exchange.ordersCanMatch_(
        [
          exchangeAddress,
          takerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          multisendAddress,
          paymentAddress,
          exchangeAddress,
          makerAddress,
          takerAddress,
          ethers.ZeroAddress,
          multisendAddress,
          paymentAddress,
        ],
        getDefaultMatchArr(currentTime),
        [0, 0, 1, 1, 0, 1],
        buyMultiSendEncoded,
        multiSendEncoded,
        buyReplacementPattern,
        sellReplacementPattern
      );

      console.log("CAN BE MATCHED: " + canBeMatched);

      console.log("HASH ORDER: " + takerHashOrder);

      // const hashOrderMessage = Buffer.from(takerHashOrder.slice(2), "hex");
      // const takerHashOrderMessage = Buffer.from(takerHashOrder.slice(2), 'hex');
      // const signedMessage = await taker.signMessage(hashOrderMessage);
      const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);
      // const takerSignedMessage = await taker.signMessage(takerHashOrderMessage);

      // console.log("MAKER SIGNED MESSAGE: " + signedMessage);

      let sig = ethers.Signature.from(signedMessage);

      await exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            multisendAddress,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            multisendAddress,
            paymentAddress,
          ],
          getDefaultMatchArr(currentTime),
          [0, 0, 1, 1, 0, 1],
          buyMultiSendEncoded,
          multiSendEncoded,
          buyReplacementPattern,
          sellReplacementPattern,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        );

      const newOwner = await erc721.ownerOf("1");
      expect(newOwner).to.be.equals(takerAddress);

      const newOwner2 = await erc721.ownerOf("2");
      expect(newOwner2).to.be.equals(takerAddress);

      const newOwner3 = await erc721.ownerOf("3");
      expect(newOwner3).to.be.equals(takerAddress);
    }
  });

  it("Seller should be able to cancel listing", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 10000);

      const iface = new ethers.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.ZeroAddress,
        "1",
      ]);

      const makerhashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        DEFAULT_ENCODE_SELLER
      );
      // const hashOrderMessage = Buffer.from(makerhashOrder.slice(2), "hex");
      // const signedMessage = await maker.signMessage(hashOrderMessage);

      const signedMessage = await signHashOrder(maker, makerhashOrder, exchangeAddress);

      let sig = ethers.Signature.from(signedMessage);
      const hashToSign = await exchange.hashToSign_(
        [
          exchangeAddress,
          makerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        1,
        0,
        0,
        callDataEncoded,
        DEFAULT_ENCODE_SELLER
      );
      console.log({ hashToSign });
      await expect(
        exchange
          .connect(taker)
          .cancelOrder_(
            [
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              paymentAddress,
            ],
            [
              expandTo18Decimals(1),
              currentTime,
              currentTime + 50000000000000,
              111,
            ],
            1,
            0,
            0,
            callDataEncoded,
            DEFAULT_ENCODE_SELLER,
            sig.v,
            sig.r,
            sig.s
          )
      ).to.be.rejectedWith();
      await expect(
        exchange
          .connect(maker)
          .cancelOrder_(
            [
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              paymentAddress,
            ],
            [
              expandTo18Decimals(1),
              currentTime,
              currentTime + 50000000000000,
              111,
            ],
            1,
            0,
            0,
            callDataEncoded,
            DEFAULT_ENCODE_SELLER,
            sig.v,
            sig.r,
            sig.s
          )
      )
        .to.emit(exchange, "OrderCancelled")
        .withArgs(hashToSign);
      await expect(
        await exchange.cancelledOrFinalized(hashToSign)
      ).to.be.equals(true);
      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        ethers.ZeroAddress,
        takerAddress,
        "1",
      ]);
      await expect(
        exchange
          .connect(taker)
          .atomicMatch_(
            [
              exchangeAddress,
              takerAddress,
              makerAddress,
              ethers.ZeroAddress,
              erc721Address,
              paymentAddress,
              exchangeAddress,
              makerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              paymentAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            DEFAULT_ENCODE_SELLER,
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s]
          )
      ).to.be.revertedWith("Invalid Order Hash or already cancelled!");
    }
  });

  it("Buyer should be able to cancel bid", async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(makerAddress), true);
    const iface = new ethers.Interface(ERC721JSON.abi);

    const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
      ethers.ZeroAddress,
      takerAddress,
      "1",
    ]);

    const takerHashOrder = await exchange.hashOrder_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      getDefaultHashOrderArr(currentTime),
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );

    // const hashOrderMessage = Buffer.from(takerHashOrder.slice(2), "hex");
    // const signedMessage = await taker.signMessage(hashOrderMessage);

    const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

    let sig = ethers.Signature.from(signedMessage);

    const hashToSign = await exchange.hashToSign_(
      [
        exchangeAddress,
        takerAddress,
        ethers.ZeroAddress,
        await protocolFee.getAddress(),
        erc721Address,
        paymentAddress,
      ],
      getDefaultHashOrderArr(currentTime),
      0,
      0,
      0,
      callDataEncodedBuyer,
      DEFAULT_ENCODE_BUYER
    );
    console.log({ hashToSign });
    await expect(
      exchange
        .connect(taker)
        .cancelOrder_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
          ],
          [
            expandTo18Decimals(1),
            currentTime,
            currentTime + 50000000000000,
            111,
          ],
          0,
          0,
          0,
          callDataEncodedBuyer,
          DEFAULT_ENCODE_BUYER,
          sig.v,
          sig.r,
          sig.s
        )
    )
      .to.emit(exchange, "OrderCancelled")
      .withArgs(hashToSign);
    await expect(await exchange.cancelledOrFinalized(hashToSign)).to.be.equals(
      true
    );

    const callDataEncoded = iface.encodeFunctionData("transferFrom", [
      makerAddress,
      takerAddress,
      "1",
    ]);

    await expect(
      exchange
        .connect(maker)
        .atomicMatch_(
          [
            exchangeAddress,
            takerAddress,
            ethers.ZeroAddress,
            await protocolFee.getAddress(),
            erc721Address,
            paymentAddress,
            exchangeAddress,
            makerAddress,
            takerAddress,
            ethers.ZeroAddress,
            erc721Address,
            paymentAddress,
          ],
          getDefaultMatchArr(currentTime),
          [0, 0, 0, 1, 0, 0],
          callDataEncodedBuyer,
          callDataEncoded,
          DEFAULT_ENCODE_BUYER,
          DEFAULT_ENCODE_SELLER,
          [sig.v, sig.v],
          [sig.r, sig.s, sig.r, sig.s]
        )
    ).to.be.revertedWith("Invalid Order Hash or already cancelled!");
  });

  it("Seller not able to match an expired offer", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      const currentTime = Math.floor(Date.now() / 1000);
      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(makerAddress), true);

      const iface = new ethers.Interface(ERC721JSON.abi);

      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "1",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        ethers.ZeroAddress,
        takerAddress,
        "1",
      ]);

      const takerHashOrder = await exchange.hashOrder_(
        [
          exchangeAddress,
          takerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
        ],
        getDefaultHashOrderArr(currentTime),
        0,
        0,
        0,
        callDataEncodedBuyer,
        DEFAULT_ENCODE_BUYER
      );
      const canBeMatched = await exchange.ordersCanMatch_(
        [
          exchangeAddress,
          takerAddress,
          ethers.ZeroAddress,
          await protocolFee.getAddress(),
          erc721Address,
          paymentAddress,
          exchangeAddress,
          makerAddress,
          takerAddress,
          ethers.ZeroAddress,
          erc721Address,
          paymentAddress,
        ],
        getDefaultMatchArr(currentTime),
        [0, 0, 0, 1, 0, 0],
        callDataEncodedBuyer,
        callDataEncoded,
        DEFAULT_ENCODE_BUYER,
        DEFAULT_ENCODE_SELLER
      );

      console.log("CAN BE MATCHED: " + canBeMatched);
      // const hashOrderMessage = Buffer.from(takerHashOrder.slice(2), "hex");
      // const signedMessage = await taker.signMessage(hashOrderMessage);

      const signedMessage = await signHashOrder(taker, takerHashOrder, exchangeAddress);

      let sig = ethers.Signature.from(signedMessage);
      //@ts-ignore
      await network.provider.send("evm_setNextBlockTimestamp", [
        currentTime + 1000000000000000000,
      ]);
      await expect(
        exchange
          .connect(maker)
          .atomicMatch_(
            [
              exchangeAddress,
              takerAddress,
              ethers.ZeroAddress,
              await protocolFee.getAddress(),
              erc721Address,
              paymentAddress,
              exchangeAddress,
              makerAddress,
              takerAddress,
              ethers.ZeroAddress,
              erc721Address,
              paymentAddress,
            ],
            getDefaultMatchArr(currentTime),
            [0, 0, 0, 1, 0, 0],
            callDataEncodedBuyer,
            callDataEncoded,
            DEFAULT_ENCODE_BUYER,
            DEFAULT_ENCODE_SELLER,
            [sig.v, sig.v],
            [sig.r, sig.s, sig.r, sig.s]
          )
      ).to.be.revertedWith("NYA_Exchange::Order not matched");
    }
  });

  it("Orderdata can match", async () => {
    if (exchange && maker && taker && protocolFee && erc721 && paymentToken) {
      await erc721.connect(maker).setApprovalForAll(await proxyRegistry.proxies(makerAddress), true);
      const iface = new ethers.Interface(ERC721JSON.abi);
      const callDataEncoded = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        ethers.ZeroAddress,
        "1",
      ]);

      const callDataEncodedBuyer = iface.encodeFunctionData("transferFrom", [
        makerAddress,
        takerAddress,
        "1",
      ]);

      const canmatchWithBuyReplacementPattern =
        await exchange.orderCalldataCanMatch(
          callDataEncodedBuyer,
          DEFAULT_ENCODE_BUYER,
          callDataEncoded,
          DEFAULT_ENCODE_SELLER
        );
      const cannotmatchWithWrongPattern = await exchange.orderCalldataCanMatch(
        callDataEncodedBuyer,
        "0x",
        callDataEncoded,
        DEFAULT_ENCODE_BUYER
      );
      const cannotmatchWithWrongSellPattern =
        await exchange.orderCalldataCanMatch(
          callDataEncodedBuyer,
          DEFAULT_ENCODE_BUYER,
          callDataEncoded,
          "0x"
        );
      const cannotmatchWithWrongBuySellPattern =
        await exchange.orderCalldataCanMatch(
          callDataEncodedBuyer,
          "0x",
          callDataEncoded,
          "0x"
        );

      expect(canmatchWithBuyReplacementPattern).to.be.eq(true);
      expect(cannotmatchWithWrongSellPattern).to.be.eq(false);
      expect(cannotmatchWithWrongBuySellPattern).to.be.eq(false);
      expect(cannotmatchWithWrongPattern).to.be.eq(false);
    }
  });
});

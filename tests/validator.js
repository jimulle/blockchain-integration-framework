/* eslint prefer-arrow-callback: "off" */
/* eslint no-new: "off" */
/* eslint func-names: ["error", "never"] */
const chai = require(`chai`);
const zmq = require(`zeromq`);

const fedcom = require(`../src/federation-communication`);
const Validator = require(`../src/Validator`);
const Multisig = require(`../src/Multisig`);
const Connector = require(`../src/pluggins/Connector`);
const config = require(`./config`);

describe(`Validator module`, function() {
  const keyOptions = {
    privKey: `9528304a9d1f091131234e7bbbb69ad2756cf6628be41b6f24433bf947665294`,
    pubKey: `031b3e4b65070268bd2ce3652966f75ebdf7184f637fd24a4fe0417c2dcb92fd9b`,
  };
  const addrOptions = {
    clientRepAddr: `tcp://127.0.0.1:17001`,
    pubAddr: `tcp://127.0.0.1:13001`,
    repAddr: `tcp://127.0.0.1:15001`,
  };

  before(function() {
    // Replace dataSign method by a method that returns {data: `some data`, signature: dataSign(`some data`)}
    const content = {
      data: `some data`,
      signature: `31a5012bcdaf27b75d34c78d643d262c8b01db477dc65f308189866cfac0f82461362e3b00039007c2f1da164de7aeeba2f491711cde191957d51cc408eb1787`, // eslint-disable-line
    };
    Validator.prototype.dataSign = async () => content;
  });

  describe(`Constructor`, function() {
    it(`Create a leader`, function() {
      // Lets set the leader to be validator 1
      const leaderOptions = {
        ...keyOptions,
        ...addrOptions,
        type: fedcom.VALIDATOR_TYPE.LEADER,
      };
      const leader = new Validator(new Connector.FABRIC(config.blockchains.fabric), leaderOptions);
      chai.expect(leader.type).to.equal(fedcom.VALIDATOR_TYPE.LEADER);
      chai.expect(leader.pubAddr).to.equal(`tcp://127.0.0.1:13001`);
      chai.expect(leader.repAddr).to.equal(`tcp://127.0.0.1:15001`);
      chai.expect(leader.clientRepAddr).to.equal(`tcp://127.0.0.1:17001`);
      chai.expect(leader.privKey).to.equal(`9528304a9d1f091131234e7bbbb69ad2756cf6628be41b6f24433bf947665294`);
      chai.expect(leader.pubKey).to.equal(`031b3e4b65070268bd2ce3652966f75ebdf7184f637fd24a4fe0417c2dcb92fd9b`);
    });

    it(`Create a follower`, function() {
      // leader is considered to be validator 2
      const followerOptions = {
        ...keyOptions,
        ...addrOptions,
        type: fedcom.VALIDATOR_TYPE.FOLLOWER,
        leaderPubAddr: `tcp://127.0.0.1:13002`,
        leaderRepAddr: `tcp://127.0.0.1:15002`,
        leaderClientRepAddr: `tcp://127.0.0.1:17002`,
      };
      const follower = new Validator(new Connector.FABRIC(config.blockchains.fabric), followerOptions);
      chai.expect(follower.type).to.equal(fedcom.VALIDATOR_TYPE.FOLLOWER);
      chai.expect(follower.pubAddr).to.equal(`tcp://127.0.0.1:13001`);
      chai.expect(follower.repAddr).to.equal(`tcp://127.0.0.1:15001`);
      chai.expect(follower.clientRepAddr).to.equal(`tcp://127.0.0.1:17001`);
      chai.expect(follower.privKey).to.equal(`9528304a9d1f091131234e7bbbb69ad2756cf6628be41b6f24433bf947665294`);
      chai.expect(follower.pubKey).to.equal(`031b3e4b65070268bd2ce3652966f75ebdf7184f637fd24a4fe0417c2dcb92fd9b`);
      chai.expect(follower.leaderPubAddr).to.equal(`tcp://127.0.0.1:13002`);
      chai.expect(follower.leaderRepAddr).to.equal(`tcp://127.0.0.1:15002`);
      chai.expect(follower.leaderClientRepAddr).to.equal(`tcp://127.0.0.1:17002`);
    });
  });

  describe(`New leader election`, function() {
    const validators = [
      {
        type: fedcom.MSG_TYPE.HEARTBEAT,
        pub: `tcp://127.0.0.1:13001`,
        rep: `tcp://127.0.0.1:15001`,
        clientRep: `tcp://127.0.0.1:17001`,
      },
      {
        type: fedcom.MSG_TYPE.HEARTBEAT,
        pub: `tcp://127.0.0.1:13002`,
        rep: `tcp://127.0.0.1:15002`,
        clientRep: `tcp://127.0.0.1:17002`,
      },
      {
        type: fedcom.MSG_TYPE.HEARTBEAT,
        pub: `tcp://127.0.0.1:13003`,
        rep: `tcp://127.0.0.1:15003`,
        clientRep: `tcp://127.0.0.1:17003`,
      },
    ];

    // TODO: add a setTimeout to wait for a natural rotation
    // Better than calling a private function or exporting it during tests only :(
    it.skip(`Select next leader from a list of validators`, function() {
      const { selectNextLeader } = Validator.selectNextLeader;
      const newLeader = selectNextLeader(validators);
      chai.expect(validators.includes(newLeader)).to.equal(true);
    });

    describe(`Switch to new leader`, function() {
      const newLeader = {
        type: fedcom.MSG_TYPE.HEARTBEAT,
        pub: `tcp://127.0.0.1:13003`,
        rep: `tcp://127.0.0.1:15003`,
        clientRep: `tcp://127.0.0.1:17003`,
      };

      it(`Switch from leader to follower`, function() {
        const leaderOptions = {
          ...keyOptions,
          ...addrOptions,
          type: fedcom.VALIDATOR_TYPE.LEADER,
        };
        const validator = new Validator(new Connector.FABRIC(config.blockchains.fabric), leaderOptions);

        // Validator starting as leader
        validator.start();
        validator.switchToNewLeader(newLeader);

        chai.expect(validator.leaderPubAddr).to.equal(`tcp://127.0.0.1:13003`);
        chai.expect(validator.leaderRepAddr).to.equal(`tcp://127.0.0.1:15003`);
        chai.expect(validator.leaderClientRepAddr).to.equal(`tcp://127.0.0.1:17003`);
        chai.expect(validator.type).to.equal(fedcom.VALIDATOR_TYPE.FOLLOWER);

        // Stop the validator
        validator.stop();
      });

      it(`Switch from follower to leader`, function() {
        // Validator is follower 3
        // Its leader is follower 2
        // It has been elected leader
        const followerOptions = {
          ...keyOptions,
          clientRepAddr: `tcp://127.0.0.1:17003`,
          pubAddr: `tcp://127.0.0.1:13003`,
          repAddr: `tcp://127.0.0.1:15003`,
          leaderPubAddr: `tcp://127.0.0.1:13002`,
          leaderRepAddr: `tcp://127.0.0.1:15002`,
          leaderClientRepAddr: `tcp://127.0.0.1:17002`,
          type: fedcom.VALIDATOR_TYPE.FOLLOWER,
        };
        const validator = new Validator(new Connector.FABRIC(config.blockchains.fabric), followerOptions);
        // Validator starting as follower 3
        validator.start();

        // New leader is follower 3
        validator.switchToNewLeader(newLeader);

        chai.expect(validator.leaderPubAddr).to.equal(`tcp://127.0.0.1:13003`);
        chai.expect(validator.leaderRepAddr).to.equal(`tcp://127.0.0.1:15003`);
        chai.expect(validator.leaderClientRepAddr).to.equal(`tcp://127.0.0.1:17003`);
        chai.expect(validator.type).to.equal(fedcom.VALIDATOR_TYPE.LEADER);

        // Stop the validator
        validator.stop();
      });

      it(`Restart the follower to follow new leader`, function() {
        // Validator is follower 1
        // His leader is follower 2
        // Elected validator is follower 3
        const followerOptions = {
          ...keyOptions,
          ...addrOptions,
          type: fedcom.VALIDATOR_TYPE.FOLLOWER,
          leaderPubAddr: `tcp://127.0.0.1:13002`,
          leaderRepAddr: `tcp://127.0.0.1:15002`,
          leaderClientRepAddr: `tcp://127.0.0.1:17002`,
        };
        const validator = new Validator(new Connector.FABRIC(config.blockchains.fabric), followerOptions);
        // Validator starting as follower 1
        validator.start();

        // New leader is follower 3
        validator.switchToNewLeader(newLeader);

        chai.expect(validator.leaderPubAddr).to.equal(`tcp://127.0.0.1:13003`);
        chai.expect(validator.leaderRepAddr).to.equal(`tcp://127.0.0.1:15003`);
        chai.expect(validator.leaderClientRepAddr).to.equal(`tcp://127.0.0.1:17003`);
        chai.expect(validator.type).to.equal(fedcom.VALIDATOR_TYPE.FOLLOWER);

        // Stop the validator
        validator.stop();
      });
    });
  });

  describe(`Start as a Leader`, function() { // eslint-disable-line
    let leader;
    this.timeout(15000);

    it(`The messages are well published via the right addr`, async function() {
      const leaderOptions = {
        ...keyOptions,
        ...addrOptions,
        type: fedcom.VALIDATOR_TYPE.LEADER,
      };
      leader = new Validator(new Connector.FABRIC(config.blockchains.fabric), leaderOptions);

      // Validator starting as leader
      leader.startAsLeader();

      // Simulate a subscriber
      const receiveBroadcast = async () =>
        new Promise((resolve, reject) => {
          const socket = zmq.socket(`sub`);
          try {
            socket.connect(`tcp://127.0.0.1:13001`);
            socket.subscribe(``);
          } catch (error) {
            reject(error);
          }

          socket.on(`message`, type => {
            resolve(type.toString());
            clearInterval(leader.intervalExec);
            leader.publishSocket.close();
            leader.requestSocket.close();
            socket.close();
          });
        });

      const type = await receiveBroadcast();
      const ok = [fedcom.MSG_TYPE.HEARTBEAT, fedcom.MSG_TYPE.NEWLEADER, fedcom.MSG_TYPE.SIGN].includes(type);
      chai.expect(ok).to.equal(true);
    });

    it(`The leader listens to heartbeat messages at repAddr`, async function() {
      const leaderOptions = {
        ...keyOptions,
        clientRepAddr: `tcp://127.0.0.1:17002`,
        pubAddr: `tcp://127.0.0.1:13002`,
        repAddr: `tcp://127.0.0.1:15002`,
        type: fedcom.VALIDATOR_TYPE.LEADER,
      };
      const validator = new Validator(new Connector.FABRIC(config.blockchains.fabric), leaderOptions);

      // Validator starting as leader
      validator.startAsLeader();
      const heartbeat = {
        type: fedcom.MSG_TYPE.HEARTBEAT,
      };

      const receiveHeartbeat = async () =>
        new Promise((resolve, reject) => {
          // Ask the leader to do the job
          const socket = new zmq.socket(`req`); // eslint-disable-line
          try {
            socket.connect(`tcp://127.0.0.1:15002`);
          } catch (error) {
            reject(error);
          }

          socket.on(`message`, msg => {
            resolve(msg.toString());
            clearInterval(validator.intervalExec);
            validator.publishSocket.close();
            validator.requestSocket.close();
            socket.close();
          });
          socket.send(JSON.stringify(heartbeat));
        });

      const ack = await receiveHeartbeat();
      chai.expect(ack).to.equal(`OK`);
      // Expect the heartbeat message to be added to the list
      // of available followers
      chai.expect(validator.availableFollowers).to.have.deep.members([heartbeat]);
    });

    it(`The leader listens to signature messages at repAddr`, async function() {
      const leaderOptions = {
        ...keyOptions,
        clientRepAddr: `tcp://127.0.0.1:17003`,
        pubAddr: `tcp://127.0.0.1:13003`,
        repAddr: `tcp://127.0.0.1:15003`,
        type: fedcom.VALIDATOR_TYPE.LEADER,
      };
      const validator = new Validator(new Connector.FABRIC(config.blockchains.fabric), leaderOptions);

      // Validator starting as leader
      validator.startAsLeader();
      const signature = {
        type: fedcom.MSG_TYPE.SIGN,
        signature: `31a5012bcdaf27b75d34c78d643d262c8b01db477dc65f308189866cfac0f82461362e3b00039007c2f1da164de7aeeba2f491711cde191957d51cc408eb1787`, // eslint-disable-line
        pubKey: `031b3e4b65070268bd2ce3652966f75ebdf7184f637fd24a4fe0417c2dcb92fd9b`,
      };

      // validator.signatures is supposed to be a Multisig object
      // Created when the leader received a signature request
      validator.signatures = new Multisig(`some data`);

      // Replace the dataSign method by the a fake function
      // That returns {data: `some data`, signature: ecdsa256(sha256(`some data`))}
      const receiveSignature = async () =>
        new Promise((resolve, reject) => {
          // Ask the leader to do the job
          const socket = new zmq.socket(`req`); // eslint-disable-line
          try {
            socket.connect(`tcp://127.0.0.1:15003`);
          } catch (error) {
            reject(error);
          }

          socket.on(`message`, msg => {
            clearInterval(validator.intervalExec);
            validator.publishSocket.close();
            validator.requestSocket.close();
            socket.close();
            resolve(msg.toString());
          });
          socket.send(JSON.stringify(signature));
        });
      const ack = await receiveSignature();
      chai.expect(ack).to.equal(`OK`);
    });
  });

  describe(`Start as a follower`, function() {
    let validator;
    let publishSocket;
    let requestSocket;

    before(function() {
      const followerOptions = {
        ...keyOptions,
        ...addrOptions,
        type: fedcom.VALIDATOR_TYPE.FOLLOWER,
        leaderPubAddr: `tcp://127.0.0.1:13002`,
        leaderRepAddr: `tcp://127.0.0.1:15002`,
        leaderClientRepAddr: `tcp://127.0.0.1:17002`,
      };
      validator = new Validator(new Connector.FABRIC(config.blockchains.fabric), followerOptions);
      publishSocket = zmq.socket(`pub`);
      publishSocket.bindSync(`tcp://127.0.0.1:13002`);
      requestSocket = zmq.socket(`rep`);
      requestSocket.bindSync(`tcp://127.0.0.1:15002`);
      validator.startAsFollower();
    });

    after(function() {
      validator.publishSocket.close();
      publishSocket.close();
      requestSocket.close();
    });

    it(`Sends heartbeat message when asked for it`, async function() {
      this.timeout(3000);
      const answerHeartbeat = async () =>
        new Promise(resolve => {
          requestSocket.on(`message`, message => {
            resolve(JSON.parse(message.toString()));
            requestSocket.send(`OK`);
          });
          publishSocket.send([fedcom.MSG_TYPE.HEARTBEAT, `{}`]);
        });
      const heartbeat = await answerHeartbeat();
      chai.expect(heartbeat).to.deep.equal({
        type: fedcom.MSG_TYPE.HEARTBEAT,
        pub: `tcp://127.0.0.1:13001`,
        rep: `tcp://127.0.0.1:15001`,
        clientRep: `tcp://127.0.0.1:17001`,
      });
    });

    it(`Sends signature when asked for it`, async function() {
      const signatureReq = {
        type: fedcom.MSG_TYPE.SIGN,
        data: `some data`,
      };

      publishSocket.send([fedcom.MSG_TYPE.SIGN, JSON.stringify(signatureReq)]);

      const receiveSignature = async () =>
        new Promise(resolve => {
          requestSocket.on(`message`, message => {
            resolve(JSON.parse(message.toString()));
            requestSocket.send(`OK`);
          });
        });
      const signature = await receiveSignature();
      chai.expect(signature).to.have.own.property(`signature`);
      chai.expect(signature).to.deep.equal({
        type: fedcom.MSG_TYPE.SIGN,
        signature: `31a5012bcdaf27b75d34c78d643d262c8b01db477dc65f308189866cfac0f82461362e3b00039007c2f1da164de7aeeba2f491711cde191957d51cc408eb1787`, // eslint-disable-line
        pubKey: `031b3e4b65070268bd2ce3652966f75ebdf7184f637fd24a4fe0417c2dcb92fd9b`,
      });
    });
  });

  describe(`Start client server`, function() {
    describe(`Start a client server on a leader`, function() { // eslint-disable-line
      this.timeout(5000);
      let leader;

      before(function() {
        const leaderOptions = {
          ...keyOptions,
          ...addrOptions,
          type: fedcom.VALIDATOR_TYPE.LEADER,
        };
        leader = new Validator(new Connector.FABRIC(config.blockchains.fabric), leaderOptions);

        // Start the leader
        leader.startClientServer();
      });

      after(function() {
        leader.clientRepSocket.close();
      });

      it(`Leader sends heartbeat message when asked`, async function() {
        // Request the leader for heartbeat
        const sendHeartbeat = async () =>
          new Promise((resolve, reject) => {
            const socket = zmq.socket(`req`);
            try {
              socket.connect(`tcp://127.0.0.1:17001`);
            } catch (error) {
              reject(error);
            }

            socket.on(`message`, msg => {
              resolve(msg.toString());
              socket.close();
            });
            const request = {
              type: fedcom.REQ_TYPE.HEARTBEAT,
            };
            socket.send(JSON.stringify(request));
          });
        const heartbeat = await sendHeartbeat();
        chai.expect(heartbeat).to.equal(`ALIVE`);
      });

      it(`Leader gathers signatures and send them back to client`, async function() {
        // Configure the validator`s pub socket
        leader.publishSocket = new zmq.socket(`pub`); // eslint-disable-line
        leader.publishSocket.bindSync(leader.pubAddr);

        // Ask the leader for signatures
        const requestSignature = async () =>
          new Promise((resolve, reject) => {
            const socket = zmq.socket(`req`);
            try {
              socket.connect(`tcp://127.0.0.1:17001`);
            } catch (error) {
              reject(error);
            }

            socket.on(`message`, msg => {
              resolve(JSON.parse(msg.toString()));
              socket.close();
              leader.publishSocket.close();
            });
            const signReq = {
              type: fedcom.REQ_TYPE.SIGN_REQ,
              data: `some data`,
            };
            socket.send(JSON.stringify(signReq));
          });
        const response = await requestSignature();
        chai.expect(response.type).to.equal(fedcom.MSG_TYPE.SIGN);
        const multisig = response.signatures;
        chai.expect(multisig.msg).to.equal(`some data`);
        chai.expect(multisig.formattedMsg).to.equal(`6cba8c69b5f9084d8eefd5dd7cf71ed5469f5bbb9d8446533ebe4beccdfb3ce9`);
        chai.expect(multisig.signatures).to.deep.equal({
          '031b3e4b65070268bd2ce3652966f75ebdf7184f637fd24a4fe0417c2dcb92fd9b':
          '31a5012bcdaf27b75d34c78d643d262c8b01db477dc65f308189866cfac0f82461362e3b00039007c2f1da164de7aeeba2f491711cde191957d51cc408eb1787', // eslint-disable-line
        });
      });
    });

    describe(`Start a client server on a follower`, function() { // eslint-disable-line
      this.timeout(5000);
      let follower;

      before(function() {
        const followerOptions = {
          ...keyOptions,
          clientRepAddr: `tcp://127.0.0.1:17005`,
          pubAddr: `tcp://127.0.0.1:13005`,
          repAddr: `tcp://127.0.0.1:15005`,
          leaderPubAddr: `tcp://127.0.0.1:13006`,
          leaderRepAddr: `tcp://127.0.0.1:15006`,
          leaderClientRepAddr: `tcp://127.0.0.1:17006`,
          type: fedcom.VALIDATOR_TYPE.FOLLOWER,
        };
        follower = new Validator(new Connector.FABRIC(config.blockchains.fabric), followerOptions);
        follower.startClientServer();
      });

      after(function() {
        follower.clientRepSocket.close();
      });

      it(`Follower sends heatbeat message when asked`, async function() {
        // Request the follower for heartbeat
        const requestHeartbeat = async () =>
          new Promise((resolve, reject) => {
            const socket = zmq.socket(`req`);
            try {
              socket.connect(`tcp://127.0.0.1:17005`);
            } catch (error) {
              reject(error);
            }

            socket.on(`message`, msg => {
              resolve(msg.toString());
              socket.close();
            });
            const request = {
              type: fedcom.REQ_TYPE.HEARTBEAT,
            };
            socket.send(JSON.stringify(request));
          });
        const heartbeat = await requestHeartbeat();
        chai.expect(heartbeat).to.equal(`ALIVE`);
      });

      it(`Follower asks the leader to gather signatures and send them back to client`, async function() {
        // Create a fake leader
        const leader = new zmq.socket(`rep`); // eslint-disable-line
        leader.bindSync(`tcp://127.0.0.1:17006`);
        leader.on(`message`, msg => {
          const msgObj = JSON.parse(msg.toString());
          if (msgObj.type === fedcom.REQ_TYPE.SIGN_REQ) {
            leader.send(
              JSON.stringify({
                type: fedcom.MSG_TYPE.SIGN,
                signatures: [`sign1`, `sign2`, `sign3`],
              })
            );
          }
          leader.close();
        });

        // Ask the validator for signatures
        const requestSignature = async () =>
          new Promise((resolve, reject) => {
            const socket = zmq.socket(`req`);
            try {
              socket.connect(`tcp://127.0.0.1:17005`);
            } catch (error) {
              reject(error);
            }

            socket.on(`message`, msg => {
              resolve(JSON.parse(msg.toString()));
              socket.close();
            });
            const signReq = {
              type: fedcom.REQ_TYPE.SIGN_REQ,
              data: `data to sign`,
            };
            socket.send(JSON.stringify(signReq));
          });
        const signatures = await requestSignature();
        chai.expect(signatures).to.deep.equal({
          type: fedcom.MSG_TYPE.SIGN,
          signatures: [`sign1`, `sign2`, `sign3`],
        });
      }); // it
    }); // describe3
  }); // describe2
}); // describe1

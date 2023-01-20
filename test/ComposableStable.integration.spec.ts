// TS_NODE_PROJECT='tsconfig.testing.json' npx mocha -r ts-node/register test/ComposableStable.integration.spec.ts
import dotenv from 'dotenv';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Vault__factory } from '@balancer-labs/typechain';
import { vaultAddr } from './testScripts/constants';
import { SubgraphPoolBase, SwapTypes, SOR } from '../src';
import {
    Network,
    MULTIADDR,
    SOR_CONFIG,
    ADDRESSES,
} from './testScripts/constants';
import { OnChainPoolDataService } from './lib/onchainData';
import { TokenPriceService } from '../src';
import { AddressZero } from '@ethersproject/constants';
import { parseFixed } from '@ethersproject/bignumber';
import { expect } from 'chai';
import { closeTo } from './lib/testHelpers';

dotenv.config();

let sor: SOR;
const networkId = Network.MAINNET;
const { ALCHEMY_URL: jsonRpcUrl } = process.env;
const rpcUrl = 'http://127.0.0.1:8545';
const provider = new JsonRpcProvider(rpcUrl, networkId);
const vault = Vault__factory.connect(vaultAddr, provider);
const bbausdt = ADDRESSES[networkId].bbausdt2.address;
const bbadai = ADDRESSES[networkId].bbadai2.address;
const bpt = ADDRESSES[networkId].bbausd2.address;
const funds = {
    sender: AddressZero,
    recipient: AddressZero,
    fromInternalBalance: false,
    toInternalBalance: false,
};

// bbausd
const testPool: SubgraphPoolBase = {
    id: '0xa13a9247ea42d743238089903570127dda72fe4400000000000000000000035d',
    address: '0xa13a9247ea42d743238089903570127dda72fe44',
    poolType: 'ComposableStable',
    swapFee: '0.00001',
    swapEnabled: true,
    totalShares: '64596326.424409523591670321',
    tokens: [
        {
            address: '0x2f4eb100552ef93840d5adc30560e5513dfffacb',
            balance: '19886024.363497322713220006',
            decimals: 18,
            weight: null,
            priceRate: '1.005556566563028326',
        },
        {
            address: '0x82698aecc9e28e9bb27608bd52cf57f704bd1b83',
            balance: '22661432.733475610301640733',
            decimals: 18,
            weight: null,
            priceRate: '1.001701405807798182',
        },
        {
            address: '0xa13a9247ea42d743238089903570127dda72fe44',
            balance: '2596148352278451.368726075585090202',
            decimals: 18,
            weight: null,
            priceRate: '1',
        },
        {
            address: '0xae37d54ae477268b9997d4161b96b8200755935c',
            balance: '22025447.315652715921042479',
            decimals: 18,
            weight: null,
            priceRate: '1.001877219965246124',
        },
    ],
    tokensList: [
        '0x2f4eb100552ef93840d5adc30560e5513dfffacb',
        '0x82698aecc9e28e9bb27608bd52cf57f704bd1b83',
        '0xa13a9247ea42d743238089903570127dda72fe44',
        '0xae37d54ae477268b9997d4161b96b8200755935c',
    ],
    amp: '1472',
};

// Setup SOR with data services
function setUp(networkId: Network, provider: JsonRpcProvider): SOR {
    // The SOR needs to fetch pool data from an external source. This provider fetches from Subgraph and onchain calls.
    const subgraphPoolDataService = new OnChainPoolDataService({
        vaultAddress: vaultAddr,
        multiAddress: MULTIADDR[networkId],
        provider,
        pools: [testPool],
    });

    class CoingeckoTokenPriceService implements TokenPriceService {
        constructor(private readonly chainId: number) {}
        async getNativeAssetPriceInToken(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            tokenAddress: string
        ): Promise<string> {
            return '0';
        }
    }

    // Use coingecko to fetch token price information. Used to calculate cost of additonal swaps/hops.
    const coingeckoTokenPriceService = new CoingeckoTokenPriceService(
        networkId
    );

    return new SOR(
        provider,
        SOR_CONFIG[networkId],
        subgraphPoolDataService,
        coingeckoTokenPriceService
    );
}
describe('ComposableStable', () => {
    context('test swaps vs queryBatchSwap', () => {
        // Setup chain
        before(async function () {
            this.timeout(20000);

            await provider.send('hardhat_reset', [
                {
                    forking: {
                        jsonRpcUrl,
                        blockNumber: 16447247,
                    },
                },
            ]);

            sor = setUp(networkId, provider);
            await sor.fetchPools();
        });

        context('ExactIn', () => {
            it('token>token', async () => {
                const swapType = SwapTypes.SwapExactIn;

                const swapInfo = await sor.getSwaps(
                    bbausdt,
                    bbadai,
                    swapType,
                    parseFixed('2301.456', 18)
                );

                const queryResult = await vault.callStatic.queryBatchSwap(
                    swapType,
                    swapInfo.swaps,
                    swapInfo.tokenAddresses,
                    funds
                );
                expect(queryResult[0].toString()).to.eq(
                    swapInfo.swapAmount.toString()
                );
                closeTo(queryResult[1].abs(), swapInfo.returnAmount, 1);
            }).timeout(10000);
            it('token>bpt', async () => {
                const swapType = SwapTypes.SwapExactIn;

                const swapInfo = await sor.getSwaps(
                    bbausdt,
                    bpt,
                    swapType,
                    parseFixed('2301.456', 18)
                );

                const queryResult = await vault.callStatic.queryBatchSwap(
                    swapType,
                    swapInfo.swaps,
                    swapInfo.tokenAddresses,
                    funds
                );
                expect(queryResult[0].toString()).to.eq(
                    swapInfo.swapAmount.toString()
                );
                expect(queryResult[1].abs().toString()).to.eq(
                    swapInfo.returnAmount.toString()
                );
            }).timeout(10000);
            it('bpt>token', async () => {
                const swapType = SwapTypes.SwapExactIn;

                const swapInfo = await sor.getSwaps(
                    bpt,
                    bbausdt,
                    swapType,
                    parseFixed('2301.456', 18)
                );

                const queryResult = await vault.callStatic.queryBatchSwap(
                    swapType,
                    swapInfo.swaps,
                    swapInfo.tokenAddresses,
                    funds
                );
                expect(queryResult[0].toString()).to.eq(
                    swapInfo.swapAmount.toString()
                );
                expect(queryResult[1].abs().toString()).to.eq(
                    swapInfo.returnAmount.toString()
                );
            }).timeout(10000);
        });

        context('ExactOut', () => {
            const swapType = SwapTypes.SwapExactOut;

            it('token>token', async () => {
                const swapInfo = await sor.getSwaps(
                    bbadai,
                    bbausdt,
                    swapType,
                    parseFixed('0.1', 18)
                );

                const queryResult = await vault.callStatic.queryBatchSwap(
                    swapType,
                    swapInfo.swaps,
                    swapInfo.tokenAddresses,
                    funds
                );
                // Amount out should be exact
                expect(queryResult[1].abs().toString()).to.eq(
                    swapInfo.swapAmount.toString()
                );
                closeTo(queryResult[0].abs(), swapInfo.returnAmount, 1);
            }).timeout(10000);
            it('token>bpt', async () => {
                const swapInfo = await sor.getSwaps(
                    bbadai,
                    bpt,
                    swapType,
                    parseFixed('1234.5678', 18)
                );

                const queryResult = await vault.callStatic.queryBatchSwap(
                    swapType,
                    swapInfo.swaps,
                    swapInfo.tokenAddresses,
                    funds
                );
                // Amount out should be exact
                expect(queryResult[1].abs().toString()).to.eq(
                    swapInfo.swapAmount.toString()
                );
                closeTo(queryResult[0].abs(), swapInfo.returnAmount, 1);
            }).timeout(10000);
            it('bpt>token', async () => {
                const swapInfo = await sor.getSwaps(
                    bpt,
                    bbadai,
                    swapType,
                    parseFixed('987.2345', 18)
                );

                const queryResult = await vault.callStatic.queryBatchSwap(
                    swapType,
                    swapInfo.swaps,
                    swapInfo.tokenAddresses,
                    funds
                );
                // Amount out should be exact
                expect(queryResult[1].abs().toString()).to.eq(
                    swapInfo.swapAmount.toString()
                );
                expect(queryResult[0].toString()).to.eq(
                    swapInfo.returnAmount.toString()
                );
            }).timeout(10000);
        });
    });
});
import axios from 'axios';

const ONE_INCH_API = 'https://api.1inch.io/v5.0';

class RealDexService {
    async get1InchSwapData(chainId, fromToken, toToken, amount, fromAddress) {
        try {
            const response = await axios.get(
                `${ONE_INCH_API}/${chainId}/swap`,
                {
                    params: {
                        fromTokenAddress: fromToken,
                        toTokenAddress: toToken,
                        amount: amount,
                        fromAddress: fromAddress,
                        slippage: 1,
                        disableEstimate: true
                    }
                }
            );
            
            return {
                tx: response.data.tx,
                toTokenAmount: response.data.toTokenAmount
            };
        } catch (error) {
            throw new Error(`1inch API error: ${error.message}`);
        }
    }

    async getSwapQuote(chainId, fromToken, toToken, amount) {
        try {
            const response = await axios.get(
                `${ONE_INCH_API}/${chainId}/quote`,
                {
                    params: {
                        fromTokenAddress: fromToken,
                        toTokenAddress: toToken,
                        amount: amount
                    }
                }
            );
            
            return {
                fromTokenAmount: response.data.fromTokenAmount,
                toTokenAmount: response.data.toTokenAmount,
                estimatedGas: response.data.estimatedGas
            };
        } catch (error) {
            throw new Error(`1inch quote error: ${error.message}`);
        }
    }
}

export default new RealDexService();
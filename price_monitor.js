import { BpxClient } from './bpx-client-main/lib.js'
import { config } from './config.js'

// 创建客户端实例
const client = new BpxClient({
  apiKey: config.apiKey,
  apiSecret: config.apiSecret,
  debug: false // 关闭调试信息，减少输出
})

// 从配置文件获取币种列表
const coins = config.coins
const spotSymbols = coins.map(coin => `${coin}_USDC`)
const perpSymbols = coins.map(coin => `${coin}_USDC_PERP`)

// 价格存储
const prices = {
  spot: {},
  perp: {}
}

// 价差阈值
const thresholdPercentage = config.priceAlerts.thresholdPercentage

// 用于记录已经提醒过的币种价差，避免重复提醒
const alertedPairs = new Set()

// 显示格式化
const formatPrice = (price) => parseFloat(price).toFixed(2)
const formatPremium = (premium) => {
  const value = parseFloat(premium).toFixed(4)
  const sign = value > 0 ? '+' : ''
  return `${sign}${value}`
}
const formatPercentage = (percentage) => {
  const value = parseFloat(percentage).toFixed(4)
  const sign = value > 0 ? '+' : ''
  return `${sign}${value}%`
}

// 清除控制台并显示价格表格
function displayPrices() {
  if (!config.display.showPriceTable) {
    return // 如果配置为不显示价格表，则直接返回
  }
  
  console.clear() // 清屏
  
  // 计算时间
  const now = new Date()
  const timeStr = now.toLocaleTimeString()
  
  // 创建表头
  console.log('=================== Backpack Exchange 价格监控 ===================')
  console.log(`更新时间: ${timeStr}`)
  console.log('------------------------------------------------------------------')
  console.log('币种    | 现货价格  | 永续合约价格 | 价差(绝对值) | 价差(百分比)')
  console.log('------------------------------------------------------------------')
  
  // 遍历币种显示价格
  for (const coin of coins) {
    const spotSymbol = `${coin}_USDC`
    const perpSymbol = `${coin}_USDC_PERP`
    
    const spotPrice = prices.spot[spotSymbol]
    const perpPrice = prices.perp[perpSymbol]
    
    if (spotPrice && perpPrice) {
      // 计算价差
      const premium = perpPrice - spotPrice
      const percentage = (premium / spotPrice) * 100
      
      // 格式化输出
      console.log(
        `${coin.padEnd(7)} | ` +
        `${formatPrice(spotPrice).padEnd(9)} | ` +
        `${formatPrice(perpPrice).padEnd(12)} | ` +
        `${formatPremium(premium).padEnd(12)} | ` +
        `${formatPercentage(percentage)}`
      )
    } else {
      console.log(`${coin.padEnd(7)} | 等待数据...`)
    }
  }
  
  console.log('------------------------------------------------------------------')
  console.log(`* 价差阈值: ${thresholdPercentage}% | 超过阈值会显示提醒`)
  console.log('==================================================================')
}

// 检查价差并显示提醒
function checkPriceDifference(coin, spotPrice, perpPrice) {
  // 计算价差
  const premium = perpPrice - spotPrice
  const percentage = (premium / spotPrice) * 100
  const absPercentage = Math.abs(percentage)
  
  // 阈值检查
  if (absPercentage >= thresholdPercentage) {
    const now = new Date().toLocaleTimeString()
    const alertKey = `${coin}_${Math.floor(percentage * 100)}`
    
    // 如果这个价差没有被提醒过，或者价差有显著变化，才显示提醒
    if (!alertedPairs.has(alertKey)) {
      // 添加到已提醒集合
      alertedPairs.add(alertKey)
      
      // 15分钟后自动从已提醒集合中移除，允许再次提醒
      setTimeout(() => {
        alertedPairs.delete(alertKey)
      }, 15 * 60 * 1000)
      
      // 显示提醒
      const premiumType = percentage > 0 ? '溢价' : '折价'
      console.log('\n========== 价差提醒 ==========')
      console.log(`时间: ${now}`)
      console.log(`币种: ${coin}`)
      console.log(`现货价格: ${formatPrice(spotPrice)}`)
      console.log(`合约价格: ${formatPrice(perpPrice)}`)
      console.log(`价差: ${formatPremium(premium)} (${formatPercentage(percentage)})`)
      console.log(`提醒: ${coin} 永续合约${premiumType}超过阈值 ${thresholdPercentage}%`)
      console.log('==============================\n')
      
      // 如果在不显示价格表的情况下，需要在控制台保留这条提醒
      if (!config.display.showPriceTable) {
        // 不需要清屏
      } else {
        // 5秒后恢复价格表显示
        setTimeout(() => {
          displayPrices()
        }, 5000)
      }
      
      return true
    }
  } else {
    // 如果价差低于阈值，从已提醒集合中移除
    const alertKey = `${coin}_${Math.floor(percentage * 100)}`
    alertedPairs.delete(alertKey)
  }
  
  return false
}

// 连接WebSocket并订阅价格
async function main() {
  try {
    // 连接WebSocket
    console.log('正在连接到Backpack Exchange...')
    await client.wsConnect()
    
    // 订阅现货频道
    const spotChannels = spotSymbols.map(symbol => `ticker.${symbol}`)
    const spotSubscribeParams = {
      method: 'SUBSCRIBE',
      params: spotChannels,
      id: 1
    }
    
    // 订阅永续合约频道
    const perpChannels = perpSymbols.map(symbol => `ticker.${symbol}`)
    const perpSubscribeParams = {
      method: 'SUBSCRIBE',
      params: perpChannels,
      id: 2
    }
    
    // 发送订阅请求
    client.wsSend(spotSubscribeParams)
    client.wsSend(perpSubscribeParams)
    
    // 处理收到的消息
    client.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        
        // 处理ticker数据
        if (message.data && message.data.e === 'ticker') {
          const symbol = message.data.s
          const price = parseFloat(message.data.c)
          
          // 根据符号判断是现货还是合约
          if (symbol.endsWith('_PERP')) {
            prices.perp[symbol] = price
            
            // 提取币种名称
            const coin = symbol.split('_')[0]
            const spotSymbol = `${coin}_USDC`
            const spotPrice = prices.spot[spotSymbol]
            
            // 如果现货价格也有了，检查价差
            if (spotPrice) {
              checkPriceDifference(coin, spotPrice, price)
            }
          } else {
            prices.spot[symbol] = price
            
            // 提取币种名称
            const coin = symbol.split('_')[0]
            const perpSymbol = `${coin}_USDC_PERP`
            const perpPrice = prices.perp[perpSymbol]
            
            // 如果永续合约价格也有了，检查价差
            if (perpPrice) {
              checkPriceDifference(coin, price, perpPrice)
            }
          }
          
          // 更新显示
          if (config.display.showPriceTable) {
            displayPrices()
          }
        }
        
        // 处理错误消息
        if (message.error) {
          console.error(`订阅错误: ${JSON.stringify(message.error)}`)
        }
        
      } catch (error) {
        // 忽略解析错误，不输出到控制台
      }
    })
    
    // 显示初始界面
    if (config.display.showPriceTable) {
      displayPrices()
    } else {
      console.log('价格监控已启动，将在价差超过阈值时显示提醒...')
      console.log(`当前监控的币种: ${coins.join(', ')}`)
      console.log(`价差阈值: ${thresholdPercentage}%`)
    }
    
    // 定期刷新显示（即使没有新数据）
    setInterval(() => {
      if (config.display.showPriceTable) {
        displayPrices()
      }
    }, config.display.refreshInterval) // 使用配置的刷新间隔
    
  } catch (error) {
    console.error('连接错误:', error.message)
  }
}

// 处理程序退出
process.on('SIGINT', () => {
  console.log('\n正在关闭连接...')
  if (client.ws) {
    client.ws.close()
  }
  process.exit(0)
})

// 启动监控
console.log('启动Backpack Exchange价格监控...')
console.log(`监控币种: ${coins.join(', ')}`)
console.log(`价差阈值: ${thresholdPercentage}%`)
main() 
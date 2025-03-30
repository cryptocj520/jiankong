// Backpack Exchange 价格监控配置文件

export const config = {
  // API 配置
  apiKey: `写api`,
  apiSecret: `写ap`,
  
  // 要监控的币种列表（可自由添加）
  coins: [
    'BTC',
    'ETH', 
    'SOL',
    'LINK',
    'JUP',
    // 可在下方添加更多币种
    // 'DOGE',
    // 'XRP',
    // 'ADA',
    // 'AVAX'
  ],
  
  // 价差提醒阈值配置
  priceAlerts: {
    // 价差百分比阈值，超过此值才会显示提醒（例如：0.1 表示 0.1%）
    // 设为0则显示所有价差
    thresholdPercentage: 0.01,
    // 是否禁用防重复机制
    disableDeduplication: false,
    // 两次提醒的最小间隔(分钟)
    alertInterval: 15
  },
  
  // 显示设置
  display: {
    // 定时刷新间隔（毫秒）
    refreshInterval: 5000,
    // 是否在控制台显示当前价格表格
    showPriceTable: true
  }
} 
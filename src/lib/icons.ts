/** Koolson/Qure 图标集，用于订阅源分组图标 */

export const ICON_BASE =
  'https://gh-proxy.com/raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color';

export const iconUrl = (name: string) => `${ICON_BASE}/${name}.png`;

export const ICON_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: '通用',
    options: [
      { value: 'Auto', label: 'Auto（自动）' },
      { value: 'Proxy', label: 'Proxy（代理）' },
      { value: 'Global', label: 'Global（全局）' },
      { value: 'Final', label: 'Final（兜底）' },
      { value: 'Server', label: 'Server（服务器）' },
      { value: 'Speedtest', label: 'Speedtest（测速）' },
      { value: 'Direct', label: 'Direct（直连）' },
      { value: 'Bypass', label: 'Bypass（绕过）' },
      { value: 'Blackhole', label: 'Blackhole（屏蔽）' },
      { value: 'Advertising', label: 'Advertising（广告）' },
      { value: 'Airport', label: 'Airport（机场）' },
      { value: 'Area', label: 'Area（地区）' },
      { value: 'Available', label: 'Available（可用）' },
      { value: 'Bot', label: 'Bot（机器人）' },
      { value: 'Download', label: 'Download（下载）' },
      { value: 'Domestic', label: 'Domestic（国内）' },
    ],
  },
  {
    label: 'AI / 工具',
    options: [
      { value: 'AI', label: 'AI' },
      { value: 'ChatGPT', label: 'ChatGPT' },
      { value: 'Copilot', label: 'Copilot' },
      { value: 'Azure', label: 'Azure' },
      { value: 'Cloudflare', label: 'Cloudflare' },
    ],
  },
  {
    label: '流媒体',
    options: [
      { value: 'YouTube', label: 'YouTube' },
      { value: 'Netflix', label: 'Netflix' },
      { value: 'Spotify', label: 'Spotify' },
      { value: 'Disney+', label: 'Disney+' },
      { value: 'Apple_TV', label: 'Apple TV' },
      { value: 'Apple_TV_Plus', label: 'Apple TV+' },
      { value: 'Apple_Music', label: 'Apple Music' },
      { value: 'AbemaTV', label: 'AbemaTV' },
      { value: 'AfreecaTV', label: 'AfreecaTV' },
      { value: 'BBC_iPlayer', label: 'BBC iPlayer' },
      { value: 'DAZN', label: 'DAZN' },
      { value: 'All4', label: 'All4' },
      { value: 'Bahamut', label: 'Bahamut' },
      { value: 'bilibili', label: 'bilibili' },
      { value: 'DomesticMedia', label: '国内媒体' },
    ],
  },
  {
    label: '社交',
    options: [
      { value: 'Telegram', label: 'Telegram' },
      { value: 'Twitter', label: 'Twitter' },
      { value: 'Discord', label: 'Discord' },
      { value: 'Clubhouse', label: 'Clubhouse' },
    ],
  },
  {
    label: '购物 / 其他',
    options: [
      { value: 'Google_Search', label: 'Google' },
      { value: 'Github', label: 'Github' },
      { value: 'Amazon', label: 'Amazon' },
      { value: 'Apple', label: 'Apple' },
      { value: 'Alibaba', label: 'Alibaba' },
      { value: 'App_Store', label: 'App Store' },
      { value: 'Cryptocurrency', label: 'Cryptocurrency' },
    ],
  },
  {
    label: '地区',
    options: [
      { value: 'HK', label: '🇭🇰 香港' },
      { value: 'TW', label: '🇹🇼 台湾' },
      { value: 'JP', label: '🇯🇵 日本' },
      { value: 'US', label: '🇺🇸 美国' },
      { value: 'SG', label: '🇸🇬 新加坡' },
      { value: 'DE', label: '🇩🇪 德国' },
      { value: 'CA', label: '🇨🇦 加拿大' },
      { value: 'AU', label: '🇦🇺 澳大利亚' },
      { value: 'BR', label: '🇧🇷 巴西' },
      { value: 'AR', label: '🇦🇷 阿根廷' },
      { value: 'IN', label: '🇮🇳 印度' },
      { value: 'KR', label: '🇰🇷 韩国' },
      { value: 'FR', label: '🇫🇷 法国' },
      { value: 'GB', label: '🇬🇧 英国' },
      { value: 'NL', label: '🇳🇱 荷兰' },
      { value: 'China_Map', label: '🇨🇳 中国大陆' },
      { value: 'China', label: '中国' },
      { value: 'Asia_Map', label: '亚洲' },
      { value: 'America_Map', label: '美洲' },
      { value: 'Africa_Map', label: '非洲' },
      { value: 'Australia', label: '大洋洲' },
    ],
  },
];

/**************************************
波段量化交易策略V1.1.3
说明：
1.本策略以一个波段为一个程序的执行周期，每次完成平仓自动停止运行。
2.本策略需要管理者指定波段参数，以明确买入卖入点位。
3.可用于短时间内对于快线波段的测试，以更快地了解自动化交易的优势。
4.波段都是以死叉区域开始，到金叉之后的一个死叉到来为一个波段。
5.可以支持短线快速波动机会，不一定是一个完整波段。

策略参数如下
参数	描述	备注	类型	默认值
WRBPrice	(?买入参数)预测波段底部价格	波段下行阶段的底部价格如果达到可以满仓	数字型(number)	300
GuideBuyPrice	指导买入价	开始买入的指导价格	数字型(number)	80
OperateFineness	买卖操作的粒度	单次买入卖出的币数量	数字型(number)	80
BuyPoint	买入点	指导价或是上次买入价下跌几个点之后开始买入	数字型(number)	0.03
BalanceLimit	买入金额数量限制	限制在这个交易对总共可以买入的金额,0值为账户全部余额	数字型(number)	300
AutoFull	到达底部价格自动满仓	由此参数决定是否在价格到达底部后操作买入满仓	布尔型(true/false)	false
StopLoss	止损线强制平仓价格	下行买入过程中一路下行达到此止损线要操作止损平仓	数字型(number)	300
-------------------------------
TPPrice	(?卖出参数)预测波段顶部价格	波段上行阶段的顶部价格如果达到将会自动操作止盈平仓	数字型(number)	300
SetSellPrice	设定卖出指导价	不采用自动卖出指导价	布尔型(true/false)	false
GuideSellPrice@SetSellPrice	指定卖出指导价	设置开始卖出的指导价格	数字型(number)	0
SellPoint	卖出点	指导价或是上次卖出价上涨几个点之后开始卖出	数字型(number)	0.05
DeathClearAll	进入死叉自动平仓	由此参数决定在上涨后下跌回死叉是否自动平仓	布尔型(true/false)	false
-------------------------------
NowCoinPrice (?其他参数)现有持仓成本	现有持仓成本价格	数字型(number)	0
BuyFee	平台买入手续费	平台买入手续费，填写数值，如0.2%就填0.002	数字型(number)	0.002
SellFee	平台卖出手续费	平台卖出手续费，填写数值，如0.2%就填0.002	数字型(number)	0.002
PriceDecimalPlace	交易价格小数位	交易对的价格小数位	数字型(number)	2
StockDecimalPlace	交易数量小数位	交易对的数量小数位	数字型(number)	0
MPOMinBuyAmount	市价单最小买入量	市价单最小买入量	数字型(number)	0
MPOMaxBuyAmount	市价单最大买入量	市价单最大买入量	数字型(number)	0
MPOMinSellAmount	市价单最小卖出量	市价单最小卖出量	数字型(number)	0
MPOMaxSellAmount	市价单最大卖出量	市价单最大卖出量	数字型(number)	0
ResetLastPrice		是否重置最后价格	重置后按当前成本价操作	布尔型(true/false)	false
ClearLog	是否清除日志	清空当前日志	布尔型(true/false)	false
************************************************/

//全局常数定义
//操作类型常量
var OPERATE_STATUS_NONE = -1;
var OPERATE_STATUS_BUY = 0; 
var OPERATE_STATUS_SELL = 1;

var StartTime = _D();	//策略启动时间
var TickTimes = 0;		//刷新次数
var ArgTables;		//已经处理好的用于显示的参数表，当参数更新时置空重新生成，以加快刷新速度
var AccountTables;	//当前的账户信息表，如果当前已经有表，只要更新当前交易对，这样可以加快刷新速度，减少内存使用
var LastLog = 0;	//上一次输出日志
var DoingStopLoss = false;	//正在操作止损
var LastCrossNum = 0;
var Records;

//初始运行检测
function checkArgs(){
	var ret = true;
	//检测参数的填写
	if(GuideBuyPrice <= 0){
		Log("参数：指导买入价为非正数，可以填写正数。 #FF0000");
		ret = false;
	}
	if(SetSellPrice && GuideSellPrice <= 0){
		Log("参数：指导卖出价为非正数，可以填写正数。 #FF0000");
		ret = false;
	}
	if(BalanceLimit < 0){
		Log("参数：买入金额数量限制为负数，可以填写正数或是0。 #FF0000");
		ret = false;
	}
	if(OperateFineness <= 0){
		Log("参数：买卖操作的粒度为非正数，必须填写正数，不能为0。 #FF0000");
		ret = false;
	}
	if(WRBPrice <= 0){
		Log("参数：波段底部价格为非正数，必须填写正数，不能为0。 #FF0000");
		ret = false;
	}
	if(TPPrice <= 0){
		Log("参数：止盈平仓价格为非正数，必须填写正数，不能为0。 #FF0000");
		ret = false;
	}
	if(StopLoss < 0){
		Log("参数：止损线强制平仓价格为负数，必须填写正数。 #FF0000");
		ret = false;
	}
	if(BuyFee <= 0 || SellFee <= 0){
		Log("参数：平台买卖手续费为非正数，必须填写此正数。 #FF0000");
		ret = false;
	}
	if(BuyFee > 1 || SellFee > 1){
		Log("参数：平台买卖手续费大于可能比例，必须填写此小于1的小数，应为数值不要百分比。 #FF0000");
		ret = false;
	}
	if(PriceDecimalPlace <= 0 || StockDecimalPlace <= 0){
		Log("参数：交易对价格/数量小数位为0或是负数，必须正确填写此字段。 #FF0000");
		ret = false;
	}
	if(BuyPoint <= 0 || SellPoint <= 0){
		Log("参数：买入点或卖出点为非正数，必须填写此正数。 #FF0000");
		ret = false;
	}
	if(BuyPoint > 1 || SellPoint > 1){
		Log("参数：买入点或卖出点大于可能比例，必须填写此小于1的小数，应为数值不要百分比。 #FF0000");
		ret = false;
	}
	if(MPOMinBuyAmount <= 0 || MPOMaxBuyAmount <= 0){
		Log("参数：市价单最小/大买入量为非正值，必须填写此正数。 #FF0000");
		ret = false;
	}
	if(MPOMinSellAmount <= 0 || MPOMaxSellAmount <= 0){
		Log("参数：市价单最小/大卖出量为非正值，必须填写此正数。 #FF0000");
		ret = false;
	}
	return ret;
}

//初始化运行参数
function init(){
	//设置排除错误日志，以免错误日志过多把机器人硬盘写爆
	SetErrorFilter("429:|403:|502:|503:|Forbidden|tcp|character|unexpected|network|timeout|WSARecv|Connect|GetAddr|no such|reset|http|received|EOF|reused");

	Log("波段量化交易策略启动...");  

	//之前已经完成清除旧日志
	if(_G("WaveRangFinish") || ClearLog){
		LogReset();
		_G("WaveRangFinish", null);
	}
		
	//初始化存储变量
	if(!_G("TotalProfit")) _G("TotalProfit", 0);
	if(!_G("LastOrderId")) _G("LastOrderId", 0);
	if(!_G("OperatingStatus")) _G("OperatingStatus", OPERATE_STATUS_NONE);
	if(!_G("AvgPrice")) _G("AvgPrice", NowCoinPrice?NowCoinPrice:0);
	if(ResetLastPrice){
		_G("LastBuyPrice", 0);
		_G("LastSellPrice", 0);
	}else{
		if(!_G("LastBuyPrice")) _G("LastBuyPrice", 0);
		if(!_G("LastSellPrice")) _G("LastSellPrice", 0);
	}
	if(!_G("ViaGoldArea")) _G("ViaGoldArea", -2);
	if(!_G("BeforeBuyingStocks")) _G("BeforeBuyingStocks", 0);
	if(!_G("BuyTimes")) _G("BuyTimes", 0);
	if(!_G("SellTimes")) _G("SellTimes", 0);
	if(!_G("WaveRangFinish")) _G("WaveRangFinish", 0);
}

//获取当前时间戳
function getTimestamp(){
	return new Date().getTime();
}

//取得倍率,type=1，买入，type=2，卖出
function getFastTime(type){
	var times = 1;
	var now = getTimestamp();
	if(type == 1){
		if(_G("LastBuy") && (now - _G("LastBuy") < 3600000)){
			var btimes = _G("LXBuyTimes");
			times = btimes+1;
		}		
	}else{
		if(_G("LastSell") && (now - _G("LastSell") < 3600000)){
			var stimes = _G("LXSellTimes");
			times = stimes+1;
		}
	}	
	return times;
}

function Cross(a, b) {
    var crossNum = 0;
    var arr1 = [];
    var arr2 = [];
    if (Array.isArray(a)) {
        arr1 = a;
        arr2 = b;
    } else {
        var records = _C(exchange.GetRecords);
		if (records && records.length < b) {
			var record = records[0];
			for(var i = 0;i<b;i++){
				records.unshift(record);
			}
		}
		Records = records;
        arr1 = TA.EMA(records, a);
        arr2 = TA.EMA(records, b);
    }
    if (arr1.length !== arr2.length) {
        throw "array length not equal";
    }
    for (var i = arr1.length-1; i >= 0; i--) {
        if (typeof(arr1[i]) !== 'number' || typeof(arr2[i]) !== 'number') {
            break;
        }
        if (arr1[i] < arr2[i]) {
            if (crossNum > 0) {
                break;
            }
            crossNum--;
        } else if (arr1[i] > arr2[i]) {
            if (crossNum < 0) {
                break;
            }
            crossNum++;
        } else {
            break;
        }
    }
    return crossNum;
}


//处理卖出成功之后数据的调整
function changeDataForSell(account,order){
	//算出扣除平台手续费后实际的数量
	var avgPrice = _G("AvgPrice");
	var TotalProfit = _G("TotalProfit");
	var profit = parseFloat((order.AvgPrice*order.DealAmount*(1-SellFee) - avgPrice*order.DealAmount).toFixed(PriceDecimalPlace));
	TotalProfit += profit;
	_G("TotalProfit", TotalProfit);
	LogProfit(TotalProfit);
	
	if(order.Status === ORDER_STATE_CLOSED ){
		Log("订单",_G("LastOrderId"),"交易成功!平均卖出价格：",order.AvgPrice,"，平均持仓价格：",avgPrice,"，卖出数量：",order.DealAmount,"，毛收盈：",profit,"，累计毛收盈：",TotalProfit);
	}else{
		Log("订单",_G("LastOrderId"),"部分成交!卖出数量：",order.DealAmount,"，剩余数量：",order.Amount - order.DealAmount,"，平均卖出价格：",order.AvgPrice,"，平均持仓价格：",avgPrice,"，毛收盈：",profit,"，累计毛收盈：",TotalProfit);
	}
	
	//设置最后一次卖出价格
	if(order.DealAmount>(order.Amount/2)){
		_G("LastSellPrice",parseFloat(order.AvgPrice));
	}
	
	//列新交易次数
	var tradeTimes = _G("SellTimes");
	tradeTimes++;
	_G("SellTimes",tradeTimes);
	
	//更新最一次买入时间和本K线买入次数
	var now = getTimestamp();
	if(_G("LastSell") && (now - _G("LastBuy") < 3600000)){
		var btimes = _G("LXSellTimes")+1;
		_G("LXSellTimes", btimes);
	}else{
		_G("LXSellTimes", 1);
	}
	_G("LastSell", now);
}

//检测卖出订单是否成功
function checkSellFinish(account,ticker){
    var ret = true;
	var lastOrderId = _G("LastOrderId");
	var order = exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED ){
		changeDataForSell(account,order);
	}else if(order.Status === ORDER_STATE_PENDING ){
		if(order.DealAmount){
			changeDataForSell(account,order);
		}else{
			if(order.Price){
				Log("订单",lastOrderId,"未有成交!卖出价格：",order.Price,"，当前价：",ticker.Last,"，价格差：",_N(order.Price - ticker.Last, PriceDecimalPlace));
			}else{
				Log("市价卖出订单",lastOrderId,"未有成交!");
				ret = false;
			}
		}
		//撤消没有完成的限价订单
		if(order.Price){
			exchange.CancelOrder(lastOrderId);
			Log("取消卖出订单：",lastOrderId);
			Sleep(1300);
		}
	}
    return ret;
}

//处理买入成功之后数据的调整
function changeDataForBuy(account,order){
	//读取原来的持仓均价和持币总量
	var avgPrice = _G("AvgPrice");
	var beforeBuyingStocks = _G("BeforeBuyingStocks");
	if(order.Status === ORDER_STATE_CLOSED ){
		Log("订单",_G("LastOrderId"),"买入交易已经成功!成交均价：",order.AvgPrice,"，挂单买入：",order.Amount,"，买到数量：",order.DealAmount);			
	}else{
		Log("订单",_G("LastOrderId"),"买入交易已经部分成交!成交均价：",order.AvgPrice,"，挂单买入：",order.Amount,"，买到数量：",order.DealAmount);		
	}
		
	//核算总持币量
	var coinAmount = beforeBuyingStocks + order.DealAmount;
	//是否对当前买入量计入长线核算
	//计算持仓总价
	var Total = parseFloat((avgPrice*beforeBuyingStocks+order.AvgPrice * order.DealAmount*(1+BuyFee)).toFixed(PriceDecimalPlace));
	
	//计算并调整平均价格
	avgPrice = parseFloat((Total / coinAmount).toFixed(PriceDecimalPlace));
	_G("AvgPrice",avgPrice);
		
	Log("当前买入后可有币数",coinAmount,"，持币均价",avgPrice,"，持币成本",Total);			
	
	//设置最后一次买入价格,仅在买入量超过一半的情况下调整最后买入价格，没到一半继续买入
	if(order.Price != 0 && order.DealAmount>(order.Amount/2) || order.Price == 0 && order.DealAmount>(order.Amount/order.AvgPrice/2)){
		_G("LastBuyPrice",parseFloat(order.AvgPrice));
	}

	//列新交易次数
	var tradeTimes = _G("BuyTimes");
	tradeTimes++;
	_G("BuyTimes",tradeTimes);
	
	//更新最一次买入时间和本K线买入次数
	var now = getTimestamp();
	if(_G("LastBuy") && (now - _G("LastBuy") < 3600000)){
		var btimes = _G("LXBuyTimes")+1;
		_G("LXBuyTimes", btimes);		
	}else{
		_G("LXBuyTimes", 1);
	}
	_G("LastBuy", now);


	//每次买入一次重置上一次卖出价格，方便以新的成本价计算下次卖出价
	_G("LastSellPrice",0);
}

//检测买入订单是否成功
function checkBuyFinish(account, ticker){
	var ret = true;
	var lastOrderId = _G("LastOrderId");
	var order = exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED ){
		//处理买入成功后的数据调整
		changeDataForBuy(account,order);
	}else if(order.Status === ORDER_STATE_PENDING ){
		if(order.DealAmount){
			//处理买入成功后的数据调整
			changeDataForBuy(account,order);
		}else{
			if(order.Price){
				Log("买入订单",lastOrderId,"未有成交!订单买入价格：",order.Price,"，当前卖一价：",ticker.Sell,"，价格差：",_N(order.Price - ticker.Sell, PriceDecimalPlace));
			}else{
				Log("市价买入订单",lastOrderId,"未有成交!");
				ret = false;
			}
		}
		//撤消没有完成的限价订单
		if(order.Price){
			exchange.CancelOrder(lastOrderId);
			Log("取消未完成的买入订单：",lastOrderId);
			Sleep(1300);
		}
	}
	return ret;
}

//定时任务，主业务流程 
function onTick() {
	//获取实时信息
	var Account = _C(exchange.GetAccount);
    var Ticker = _C(exchange.GetTicker);
	
	//检测上一个订单，成功就改状态，不成功就取消重新发
	if(_G("LastOrderId") && _G("OperatingStatus") != OPERATE_STATUS_NONE){
		var ret = false;
		if(_G("OperatingStatus") > OPERATE_STATUS_BUY){
			ret = checkSellFinish(Account, Ticker);
		}else{
			ret = checkBuyFinish(Account, Ticker);
		}
		if(ret){
			//刚才上一次订单ID清空，不再重复判断
			_G("LastOrderId",0);
			//重置操作状态
			_G("OperatingStatus", OPERATE_STATUS_NONE);
		}else{
			return;
		}
	}

    //定义并初始化其他变量
	var avgPrice = _G("AvgPrice");
    var lastBuyPrice = _G("LastBuyPrice");
    var lastSellPrice = _G("LastSellPrice");
	var viaGoldArea = _G("ViaGoldArea");
    var coinAmount = Account.Stocks+Account.FrozenStocks; //从帐户中获取可用币数量
    var allCoinAmount = Account.Stocks+Account.FrozenStocks; //从帐户中获取当前持仓信息
    var costTotal = parseFloat((avgPrice*allCoinAmount).toFixed(PriceDecimalPlace));	//从帐户中获取当前持仓信息和平均价格算出来
	var stockValue = parseFloat((allCoinAmount*Ticker.Last).toFixed(PriceDecimalPlace));
	var opAmount = 0;
    var orderid = 0;
	var isOperated = false;	

	//判断止损有没有完成
	if(DoingStopLoss && coinAmount <= MPOMinSellAmount){
		Log("止损操作已经完成。");
		_G("WaveRangFinish", 1);
		return;
	}
	
	//获取行情数据
    CrossNum = Cross(9, 26);
    if (CrossNum > 0) {
		//如果超过2，就更改通过金叉标识
		if(CrossNum >= 2 && LastCrossNum != -1 && viaGoldArea==-1){
			Log("更改通过金叉标识为1");
			viaGoldArea = 1;
			_G("ViaGoldArea", viaGoldArea);
		}else if(CrossNum == 1 && viaGoldArea == -2 && coinAmount >= MPOMinSellAmount){
			viaGoldArea = -1;
			_G("ViaGoldArea", viaGoldArea);
		}
    } else {
        //如果超过-2，就更改通过金叉标识
        if(viaGoldArea == 1 && (CrossNum >= -2 && coinAmount <= MPOMinSellAmount || CrossNum <= -3)){
			Log("更改通过金叉标识为0");
			viaGoldArea = 0;
			_G("ViaGoldArea", viaGoldArea);
			if(coinAmount <= MPOMinSellAmount){
				//停止
				_G("WaveRangFinish", 1);
			}else{
				//继续
				viaGoldArea = -2;
			}
		}else if(CrossNum < -2 && viaGoldArea == -1){
			viaGoldArea = -2;
			_G("ViaGoldArea", viaGoldArea);
		}
    }
    LastCrossNum = CrossNum;
    
    //决定操作指导价
    var baseBuyPrice = lastBuyPrice ? lastBuyPrice : GuideBuyPrice * (1 + BuyPoint);
    var baseSellPrice = 0;
    if(lastSellPrice > 0){
    	baseSellPrice = lastSellPrice;
    }else{
    	if(avgPrice > 0 && !SetSellPrice){
			baseSellPrice = avgPrice;
		}else{
    		baseSellPrice = GuideSellPrice * (1 - SellPoint);
		}
    }
	//评估买入
	if (CrossNum < 0 && Account.Balance > MPOMinBuyAmount && !DoingStopLoss && (BalanceLimit > 0 && costTotal < BalanceLimit || BalanceLimit == 0) && (Ticker.Sell < baseBuyPrice * (1 - BuyPoint*getFastTime(1)) || AutoFull && Ticker.Sell < WRBPrice)) {
		if(AutoFull && Ticker.Sell < WRBPrice){
			Log("价格达到预定波段底部价格线，按操作粒度进行买入到满仓。");
		}
		//判断当前余额下可买入数量
		var canpay = Account.Balance;
		if(BalanceLimit > 0){
			canpay = BalanceLimit - costTotal;
			if(Account.Balance < canpay){
				canpay = Account.Balance;
			}
		}
		var canbuy = canpay/Ticker.Sell;
		var operatefineness = OperateFineness*(GuideBuyPrice/Ticker.Sell)*getFastTime(1);
		opAmount = canbuy > operatefineness? operatefineness : canbuy;
		var buyfee = _N(opAmount*Ticker.Sell, PriceDecimalPlace);
		if(MPOMaxBuyAmount < buyfee){
			buyfee = MPOMaxBuyAmount;
			opAmount = buyfee/Ticker.Sell;
		}
		if(buyfee > MPOMinBuyAmount){
			isOperated = true;
			Log("准备以大约",Ticker.Sell,"的市价买入约",opAmount,"个币，当前账户余额为：",Account.Balance,"。"); 
			//设置小数位，第一个为价格小数位，第二个为数量小数位
			exchange.SetPrecision(PriceDecimalPlace, PriceDecimalPlace);
			orderid = exchange.Buy(-1,buyfee);
			_G("OperatingStatus",OPERATE_STATUS_BUY);
			_G("BeforeBuyingStocks",allCoinAmount);
		}
	}
	if(!orderid){
		//评估卖出
		var sellFastTime = getFastTime(2);
		var TPNow = false;
		if(CrossNum < 0 && Ticker.Buy/avgPrice > 1.08){
			var lastrecord = Records[Records.length -1];
			var secondrecord = Records[Records.length -2];
			if(secondrecord.Open/secondrecord.Low > 1.1 || lastrecord.Open/lastrecord.Low > 1.1){
				var now = getTimestamp();
				var lastbuy = _G("LastBuy");
				if(!lastbuy) lastbuy = now;
				var diff = now-lastbuy;
				if(diff > 1800000){
					TPNow = true;
					Log("出现超跌抄底，现已经出现浮盈，进行平仓");
				}
			}
		}
		if (coinAmount > MPOMinSellAmount && (TPNow || Ticker.Buy > TPPrice || Ticker.Buy > baseSellPrice * (1 + SellPoint*sellFastTime) || DeathClearAll && viaGoldArea == 1 && (CrossNum === -1 || CrossNum === -2) && Ticker.Buy > avgPrice || CrossNum < 0 && Ticker.Buy <= StopLoss)) {
			var dosell = true;
			if(CrossNum < 0){
				if(Ticker.Buy <= StopLoss){
					Log("价格跌下止损线，对现有持仓进行强制平仓。");
					if(!DoingStopLoss) DoingStopLoss = true;
				}else if(TPNow || Ticker.Buy > baseSellPrice * (1 + SellPoint*sellFastTime)){
					Log("死叉内短线浮盈，对现有止盈获得头寸。");
				}else{
					Log("进入了死叉，对现有获利盘持仓进行平仓。");
				}
			}else{
				Log("进入了盈利空间，对现有获利盘持仓进行止盈。");
			}
			var operatefineness = parseFloat((OperateFineness*(Ticker.Buy/avgPrice)*sellFastTime).toFixed(StockDecimalPlace));
			opAmount = coinAmount > operatefineness? operatefineness : _N((coinAmount + 0),StockDecimalPlace);
			if(MPOMaxSellAmount < opAmount){
				opAmount = MPOMaxSellAmount;
			}
			if(opAmount > MPOMinSellAmount){
				isOperated = true;
				Log("准备以大约",Ticker.Buy,"的市价卖出",opAmount,"个币，当前可用币数",coinAmount);
				//设置小数位，第一个为价格小数位，第二个为数量小数位
				exchange.SetPrecision(PriceDecimalPlace, StockDecimalPlace);
				orderid = exchange.Sell(-1, opAmount);
				_G("OperatingStatus",OPERATE_STATUS_SELL);
			}else{
				Log("当前持仓数量小于最小持仓量，没有币可卖，看机会再买入。");
			}
		}
		if(!orderid){
			var now = getTimestamp();
			if(now > LastLog + 900000 ){
				LastLog = now;
				if (CrossNum < 0 ){
					Log("当前EMA交叉数",CrossNum,"，持仓量",coinAmount,"，币价",Ticker.Last,"，价格没有下跌到买入点，继续观察行情...");
				}else{
					Log("当前EMA交叉数",CrossNum,"，持仓量",coinAmount,"，币价",Ticker.Last,"，价格没有上涨到卖出点，继续观察行情...");
				}
			}
		}
	}
    //判断并输出操作结果
	if(isOperated){
		if (orderid) {
			_G("LastOrderId",orderid);
			Log("订单发送成功，订单编号：",orderid);
		}else{
			_G("OperatingStatus",OPERATE_STATUS_NONE);
			Log("订单发送失败，取消正在操作状态");
		}
	}

	TickTimes++;
	//显示参数信息
	if(!ArgTables){
		var argtables = [];
		var table = {};
		table.type="table";
		table.title = "策略参数表";
		table.cols = ['参数', '参数名称', '值'];
		var rows = [];
		rows.push(['WRBPrice','波段底部价格', WRBPrice]);		
		rows.push(['GuideBuyPrice','指导买入价', GuideBuyPrice]);		
		rows.push(['OperateFineness','买卖操作的粒度', OperateFineness]);		
		rows.push(['BuyPoint','买入点', BuyPoint]);		
		rows.push(['BalanceLimit','买入金额数量限制', BalanceLimit]);		
		rows.push(['AutoFull','到达底部价格自动满仓', AutoFull?'允许':'不允许']);		
		rows.push(['StopLoss','止损线强制平仓价格', StopLoss]);		
		rows.push(['TPPrice','止盈平仓价格', TPPrice]);		
		rows.push(['SetSellPrice','指定卖出指导价格', SetSellPrice?'指定':'自动']);		
		rows.push(['GuideSellPrice','指导卖出价', SetSellPrice?GuideSellPrice:'均价上浮一个卖出点']);		
		rows.push(['SellPoint','卖出点', SellPoint]);		
		rows.push(['DeathClearAll','进入死叉自动平仓', DeathClearAll?'允许':'不允许']);		
		rows.push(['BuyFee','平台买入手续费', BuyFee]);		
		rows.push(['SellFee','平台卖出手续费', SellFee]);		
		rows.push(['NowCoinPrice','现有持仓成本', NowCoinPrice]);		
		rows.push(['PriceDecimalPlace','交易对价格小数位', PriceDecimalPlace]);		
		rows.push(['StockDecimalPlace','交易对数量小数位', StockDecimalPlace]);		
		rows.push(['TradeLimits','市价单交易限额', '最小买入量：'+MPOMinBuyAmount+'，最大买入量：'+MPOMaxBuyAmount+'，最小卖出量：'+MPOMinSellAmount+'，最大卖出量：'+MPOMaxSellAmount]);		
		table.rows = rows;
		argtables.push(table);
		ArgTables = argtables;
	}		

	//显示帐户信息
	if(!AccountTables){
		var accounttables = [];
		var accounttable1 = {};
		accounttable1.type="table";
		accounttable1.title = "交易状态信息";
		accounttable1.cols = ['可用余额','可用币数','持仓均价','持仓成本','当前币价','持币价值','上次买入价','上次卖出价','买入次数','卖出次数','总交易次数'];
		var rows = [];
		rows.push([parseFloat(Account.Balance).toFixed(8), parseFloat((Account.Stocks+0).toFixed(8)), avgPrice, costTotal, 
		Ticker.Last, stockValue,  parseFloat(lastBuyPrice).toFixed(PriceDecimalPlace),  parseFloat(lastSellPrice).toFixed(PriceDecimalPlace), _G("BuyTimes"), _G("SellTimes"), _G("BuyTimes")+_G("SellTimes")]);
		accounttable1.rows = rows;
		accounttables.push(accounttable1);
		AccountTables = accounttables;
	}else{
		var accounttable1 = AccountTables[0];
		var newrows = [];
		newrows.push([parseFloat(Account.Balance).toFixed(8), parseFloat((Account.Stocks+0).toFixed(8)), avgPrice, costTotal, 
		Ticker.Last, stockValue,  parseFloat(lastBuyPrice).toFixed(PriceDecimalPlace),  parseFloat(lastSellPrice).toFixed(PriceDecimalPlace), _G("BuyTimes"), _G("SellTimes"), _G("BuyTimes")+_G("SellTimes")]);
		accounttable1.rows = newrows;
	}
	LogStatus("`" + JSON.stringify(ArgTables)+"`\n`" + JSON.stringify(AccountTables)+"`\n 策略累计收益："+ _G("TotalProfit")+ "\n 策略启动时间："+ StartTime + " 累计刷新次数："+ TickTimes + " 最后刷新时间："+ _D());	
}


function main() {
	Log("开始执行主事务程序...");  
	//检测参数
	if(!checkArgs()) return;
	
	//执行循环事务
	while (true) {
		//操作交易
		onTick();
		//判断完成
		if(_G("WaveRangFinish")){
			Log("波段已经完成，程序运行结束。");
			break;
		}
		Sleep(10 * 1000);
	}
	//清空波段变量
	_G("LastOrderId", null);
	_G("OperatingStatus", null);
	_G("AvgPrice", null);
	_G("LastBuyPrice", null);
	_G("LastSellPrice", null);
	_G("ViaGoldArea", null);
	_G("BeforeBuyingStocks", null);
	_G("BuyTimes", null);
	_G("SellTimes", null);
}
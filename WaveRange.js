/**************************************
波段量化交易策略V1.0
说明：
1.本策略以一个波段为一个程序的执行周期，每次完成平仓自动停止运行。
2.本策略需要管理者指定波段参数，以明确买入卖入点位。
3.可用于短时间内对于快线波段的测试，以更快地了解自动化交易的优势。
4.波段都是以死叉区域开始，到金叉之后的一个死叉到来为一个波段。

策略参数如下
参数	描述	类型	默认值
GuideBuyPrice	指导买入价	数字型(number)	80
GuideSellPrice	指导卖出价	数字型(number)	80
BuyPoint	买入点	数字型(number)	0.03
SellPoint	卖出点	数字型(number)	0.05
OperateFineness	买卖操作的粒度	数字型(number)	80
BalanceLimit	买入金额数量限制	数字型(number)	300
TPPrice		止盈平仓价格	数字型(number)	300
StopLoss	止损线强制平仓价格	数字型(number)	300
DeathClearAll	进入死叉自动平仓	布尔型(true/false)	false
PriceDecimalPlace	交易价格小数位		数字型(number)	2
StockDecimalPlace	交易数量小数位		数字型(number)	0
BuyFee	平台买入手续费		数字型(number)	0.002
SellFee	平台卖出手续费		数字型(number)	0.002
MPOMinBuyAmount	市价单最小买入量	数字型(number)	0
MPOMaxBuyAmount	市价单最大买入量	数字型(number)	0
MPOMinSellAmount	市价单最小卖出量	数字型(number)	0
MPOMaxSellAmount	市价单最大卖出量	数字型(number)	0
************************************************/

//全局常数定义
//操作类型常量
var OPERATE_STATUS_NONE = -1;
var OPERATE_STATUS_BUY = 0; 
var OPERATE_STATUS_SELL = 1;

var TotalProfit = 0;	//策略累计收益
var StartTime = _D();	//策略启动时间
var TickTimes = 0;		//刷新次数
var ArgTables;		//已经处理好的用于显示的参数表，当参数更新时置空重新生成，以加快刷新速度
var AccountTables;	//当前的账户信息表，如果当前已经有表，只要更新当前交易对，这样可以加快刷新速度，减少内存使用

//初始化运行参数
function init(){
	//设置排除错误日志，以免错误日志过多把机器人硬盘写爆
	SetErrorFilter("429:|403:|502:|503:|Forbidden|tcp|character|unexpected|network|timeout|WSARecv|Connect|GetAddr|no such|reset|http|received|EOF|reused");

	Log("波段量化交易策略启动...");  

	//初始化存储变量
	if(_G("TotalProfit")) _G("TotalProfit",0);

}

//获取当前行情
function GetTicker(tp) {
    return _C(exchange.GetTicker);
}

//获取帐户信息
function GetAccount(tp) {
    return _C(exchange.GetAccount);
}

function Cross(a, b) {
    var pfnMA = [TA.EMA, TA.MA, talib.KAMA][MAType];
    var crossNum = 0;
    var arr1 = [];
    var arr2 = [];
    if (Array.isArray(a)) {
        arr1 = a;
        arr2 = b;
    } else {
        var records = null;
        while (true) {
            records = exchange.GetRecords();
            if (records && records.length > a && records.length > b) {
                break;
            }
            Sleep(1000);
        }
        arr1 = pfnMA(records, a);
        arr2 = pfnMA(records, b);
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
function changeDataForSell(tp,account,order){
	//算出扣除平台手续费后实际的数量
	var avgPrice = _G("AvgPrice");
	var TotalProfit = _G("TotalProfit");
	var SubProfit = _G("SubProfit");
	var profit = parseFloat((order.AvgPrice*order.DealAmount*(1-SellFee) - avgPrice*order.DealAmount).toFixed(PriceDecimalPlace));
	SubProfit += profit;
	TotalProfit += profit;
	tp.Profit = SubProfit;
	_G("SubProfit", SubProfit);
	_G("TotalProfit", TotalProfit);
	LogProfit(TotalProfit);
	
	if(order.Status === ORDER_STATE_CLOSED ){
		Log(tp.Title,"交易对订单",_G("LastOrderId"),"交易成功!平均卖出价格：",order.AvgPrice,"，平均持仓价格：",avgPrice,"，卖出数量：",order.DealAmount,"，毛收盈：",profit,"，累计毛收盈：",TotalProfit);
	}else{
		Log(tp.Title,"交易对订单",_G("LastOrderId"),"部分成交!卖出数量：",order.DealAmount,"，剩余数量：",order.Amount - order.DealAmount,"，平均卖出价格：",order.AvgPrice,"，平均持仓价格：",avgPrice,"，毛收盈：",profit,"，累计毛收盈：",TotalProfit);
	}
	
	//设置最后一次卖出价格
	if(!needreturn && order.DealAmount>(order.Amount/2)){
		_G("LastSellPrice",parseFloat(order.AvgPrice));
	}
	
	//列新交易次数
	var tradeTimes = _G("SellTimes");
	tradeTimes++;
	_G("SellTimes",tradeTimes);
	
}

//检测卖出订单是否成功
function checkSellFinish(tp,account){
    var ret = true;
	var lastOrderId = _G("LastOrderId");
	var order = exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED ){
		changeDataForSell(tp,account,order);
	}else if(order.Status === ORDER_STATE_PENDING ){
		if(order.DealAmount){
			changeDataForSell(tp,account,order);
		}else{
			if(order.Price){
				Log(tp.Title,"交易对订单",lastOrderId,"未有成交!卖出价格：",order.Price,"，当前价：",GetTicker(tp).Last,"，价格差：",_N(order.Price - GetTicker(tp).Last, PriceDecimalPlace));
			}else{
				Log(tp.Title,"交易对市价卖出订单",lastOrderId,"未有成交!");
			}
		}
		//撤消没有完成的限价订单
		if(order.Price){
			exchange.CancelOrder(lastOrderId);
			Log(tp.Title,"交易对取消卖出订单：",lastOrderId);
			Sleep(1300);
		}
	}
    return ret;
}

//处理买入成功之后数据的调整
function changeDataForBuy(tp,account,order){
	//读取原来的持仓均价和持币总量
	var avgPrice = _G("AvgPrice");
	var beforeBuyingStocks = _G("BeforeBuyingStocks");
	if(order.Status === ORDER_STATE_CLOSED ){
		Log(tp.Title,"交易对订单",_G("LastOrderId"),"买入交易已经成功!成交均价：",order.AvgPrice,"，挂单买入：",order.Amount,"，买到数量：",order.DealAmount);			
	}else{
		Log(tp.Title,"交易对订单",_G("LastOrderId"),"买入交易已经部分成交!成交均价：",order.AvgPrice,"，挂单买入：",order.Amount,"，买到数量：",order.DealAmount);		
	}
		
	//核算总持币量
	var coinAmount = beforeBuyingStocks + order.DealAmount;
	//是否对当前买入量计入长线核算
	//计算持仓总价
	var Total = parseFloat((avgPrice*beforeBuyingStocks+order.AvgPrice * order.DealAmount*(1+BuyFee)).toFixed(PriceDecimalPlace));
	
	//计算并调整平均价格
	avgPrice = parseFloat((Total / coinAmount).toFixed(PriceDecimalPlace));
	_G("AvgPrice",avgPrice);
	
	Log(tp.Title,"交易对当前买入计入核算，长线持仓价格调整到：",avgPrice,"，总持仓数量：",coinAmount,"，总持币成本：",Total);			
	
	//设置最后一次买入价格,仅在买入量超过一半的情况下调整最后买入价格，没到一半继续买入
	if(order.Price != 0 && order.DealAmount>(order.Amount/2) || order.Price == 0 && order.DealAmount>(order.Amount/order.AvgPrice/2)){
		_G("LastBuyPrice",parseFloat(order.AvgPrice));
	}

	//列新交易次数
	var tradeTimes = _G("BuyTimes");
	tradeTimes++;
	_G("BuyTimes",tradeTimes);
		
	//保存每次买入之后币的数量
	_G("lastBuycoinAmount", coinAmount);
	
	//每次买入一次重置上一次卖出价格，方便以新的成本价计算下次卖出价
	_G("LastSellPrice",0);
	_G("HistoryHighPoint", 0);
}

//检测买入订单是否成功
function checkBuyFinish(tp,account){
	var lastOrderId = _G("LastOrderId");
	var order = exchange.GetOrder(lastOrderId);
	if(order.Status === ORDER_STATE_CLOSED ){
		//处理买入成功后的数据调整
		changeDataForBuy(tp,account,order);
	}else if(order.Status === ORDER_STATE_PENDING ){
		if(order.DealAmount){
			//处理买入成功后的数据调整
			changeDataForBuy(tp,account,order);
		}else{
			if(order.Price){
				Log(tp.Title,"交易对买入订单",lastOrderId,"未有成交!订单买入价格：",order.Price,"，当前卖一价：",GetTicker(tp).Sell,"，价格差：",_N(order.Price - GetTicker(tp).Sell, PriceDecimalPlace));
			}else{
				Log(tp.Title,"交易对市价买入订单",lastOrderId,"未有成交!");
			}
		}
		//撤消没有完成的限价订单
		if(order.Price){
			exchange.CancelOrder(lastOrderId);
			Log(tp.Title,"交易对取消未完成的买入订单：",lastOrderId);
			Sleep(1300);
		}
	}
}

//定时任务，主业务流程 
function onTick(tp) {
	//获取实时信息
	var Account = GetAccount(tp);
    var Ticker = GetTicker(tp);
	
	//检测上一个订单，成功就改状态，不成功就取消重新发
	if(_G("LastOrderId") && _G("OperatingStatus") != OPERATE_STATUS_NONE){
		if(_G("OperatingStatus") > OPERATE_STATUS_BUY){
			checkSellFinish(tp,Account);
		}else{
			checkBuyFinish(tp,Account);
		}
		//刚才上一次订单ID清空，不再重复判断
		_G("LastOrderId",0);
		//重置操作状态
		_G("OperatingStatus", OPERATE_STATUS_NONE);
	}

    //定义并初始化其他变量
	//获取当前均价
	var avgPrice = _G("AvgPrice");
	if(!avgPrice){
		//平均价格为空或0，说明新启动，尝试从参数读入并写入存储
		avgPrice = NowCoinPrice;
		_G("AvgPrice",avgPrice);
	}
	//处理持仓价格变量
    var coinAmount = Account.Stocks+Account.FrozenStocks; //从帐户中获取当前持仓信息
	if(coinAmount > MPOMinSellAmount && avgPrice === 0){
		Log(tp.Name+"交易对账户有持币，但是输入的均价为0，请确认参数！！ #FF0000");
		return false;
	}
	var stockValue = parseFloat((coinAmount*Ticker.Last).toFixed(PriceDecimalPlace));
	var buyDynamicPoint = _G("BuyDynamicPoint");	
	var sellDynamicPoint = _G("SellDynamicPoint");
    var lastBuyPrice = _G("LastBuyPrice");
    var lastSellPrice = _G("LastSellPrice");
	var historyHighPoint = _G("HistoryHighPoint");
	var overFallBuy = _G("OverFallBuy");
	var viaGoldArea = _G("ViaGoldArea");
	var operateFineness = _G("OperateFineness");
    var costTotal = parseFloat((avgPrice*coinAmount).toFixed(PriceDecimalPlace));	//从帐户中获取当前持仓信息和平均价格算出来
	var opAmount = 0;
    var orderid = 0;
	var isOperated = false;	

	//获取行情数据
    CrossNum = Cross(7, 21);
    if (CrossNum > 0) {
		//调整买入后的量高价格
		if(Ticker.Buy > historyHighPoint){
			historyHighPoint = Ticker.Buy;
			_G("HistoryHighPoint", historyHighPoint);
		}
		//如果超过2，就更改通过金叉标识
		if(CrossNum >= 2 && !viaGoldArea){
			Log("更改通过金叉标识为1");
			viaGoldArea = 1;
			_G("ViaGoldArea", viaGoldArea);
		}
    } else {
        //如果超过-2，就更改通过金叉标识
        if(viaGoldArea && (CrossNum >= -2 && coinAmount <= MinCoinLimit+MPOMinSellAmount*2 || CrossNum <= -3)){
			Log("更改通过金叉标识为0");
			viaGoldArea = 0;
			_G("ViaGoldArea", viaGoldArea);
		}
    }
    var baseBuyPrice = lastBuyPrice ? lastBuyPrice : GuideBuyPrice;
    var baseSellPrice = lastSellPrice ? lastSellPrice : GuideSellPrice;
	//再来做慢节奏的行情判断
	if (CrossNum < 0 && Account.Balance > MPOMinBuyAmount && Ticker.Sell < baseBuyPrice * (1 - buyDynamicPoint - BuyFee)) {
		if(coinAmount <= MaxCoinLimit){
			//判断当前余额下可买入数量
			var canpay = (MaxCoinLimit - coinAmount) * Ticker.Sell;
			if(Account.Balance < canpay){
				canpay = Account.Balance;
			}
			var canbuy = canpay/Ticker.Sell;
			opAmount = canbuy > OperateFineness? OperateFineness : canbuy;
			var buyfee = opAmount*Ticker.Sell;
			if(MPOMaxBuyAmount < buyfee){
				buyfee = MPOMaxBuyAmount;
				opAmount = buyfee/Ticker.Sell;
			}
			if(buyfee > MPOMinBuyAmount){
				if(coinAmount <= MPOMinSellAmount){
					if(debug) Log("卖空之后第一次买入，以现价", Ticker.Sell, "，准备买入",opAmount,"个币。");
				}else{
					if(debug) Log("当前市价", Ticker.Sell, " < 买入点", parseFloat((baseBuyPrice * (1 - SellPoint - BuyFee)).toFixed(PriceDecimalPlace)), "，准备买入",opAmount,"个币。");
				}
				isOperated = true;
				Log("当前基准买入价格", baseBuyPrice, "上次买入价格", lastBuyPrice, "动态买入点", buyDynamicPoint, "当前持仓总量", coinAmount);
				Log(tp.Title+"交易对准备以",Ticker.Sell,"的价格买入",opAmount,"个币，当前账户余额为：",Account.Balance,"。本次下单金额",buyfee,"，本次预期买入数量",opAmount,"，预期成交价格",Ticker.Sell); 
				orderid = exchange.Buy(-1,buyfee);
				_G("OperatingStatus",OPERATE_STATUS_BUY);
				_G("BeforeBuyingStocks",coinAmount);
			}
		}else{
			if(debug) Log("当前持仓数量已经达到最大持仓量", MaxCoinLimit, "，不再买入，看机会卖出。");
		}
	}
	if(!orderid){
		if (coinAmount > MinCoinLimit+MPOMinSellAmount && (CrossNum > 0 && (Ticker.Buy > TPPrice || Ticker.Buy > baseSellPrice * (1 + sellDynamicPoint + SellFee)) || DeathClearAll && viaGoldArea && (CrossNum === -1 || CrossNum === -2) && Ticker.Buy > avgPrice || CrossNum < 0 && Ticker.Buy <= StopLoss)) {
			var dosell = true;
			if(CrossNum < 0){
				if(Ticker.Buy <= StopLoss){
					Log("价格跌下止损线，对现有持仓进行强制平仓。");
				}else{
					Log("进入了死叉，对现有获利盘持仓进行平仓。");
				}
			}else{
				Log("进入了盈利空间，对现有获利盘持仓进行止盈。");
			}
			opAmount = (coinAmount - MinCoinLimit) > OperateFineness? OperateFineness : _N((coinAmount - MinCoinLimit),StockDecimalPlace);
			if(MPOMaxSellAmount < opAmount){
				opAmount = MPOMaxSellAmount;
			}
			if(coinAmount > MinCoinLimit && opAmount > MPOMinSellAmount){
				if(debug) Log("当前市价", Ticker.Buy, " > 卖出点", parseFloat((baseSellPrice * (1 + SellPoint + SellFee)).toFixed(PriceDecimalPlace)), "，准备卖出",opAmount,"个币");
				isOperated = true;
				Log(tp.Title+"交易对准备以大约",Ticker.Buy,"的价格卖出",opAmount,"个币，当前持仓总量",coinAmount, "动态卖出点", sellDynamicPoint, "基准卖出价", baseSellPrice);
				orderid = exchange.Sell(-1, opAmount);
				_G("OperatingStatus",OPERATE_STATUS_SELL);
			}else{
				if(debug) Log("当前持仓数量小于最小持仓量", MinCoinLimit, "，没有币可卖，看机会再买入。");
			}
		}
		if(!orderid){
			if (CrossNum < 0 ){
				if(debug) Log("价格没有下跌到买入点，继续观察行情...");
			}else{
				if(debug) Log("价格没有上涨到卖出点，继续观察行情...");
			}
		}
	}
    //判断并输出操作结果
	if(isOperated){
		if (orderid) {
			_G("LastOrderId",orderid);
			if(debug) Log("订单发送成功，订单编号：",orderid);
		}else{
			_G("OperatingStatus",OPERATE_STATUS_NONE);
			if(debug) Log("订单发送失败，取消正在操作状态");
		}
	}

	TickTimes++;
	//显示参数信息
	if(!ArgTables){
		var argtables = [];
		var table = {};
		table.type="table";
		table.title = tp.Title;
		table.cols = ['参数', '参数名称', '值'];
		var rows = [];
		rows.push(['GuideBuyPrice','指导买入价', GuideBuyPrice]);		
		rows.push(['GuideSellPrice','指导卖出价', GuideSellPrice]);		
		rows.push(['BuyPoint','买入点', BuyPoint]);		
		rows.push(['SellPoint','卖出点', SellPoint]);		
		rows.push(['OperateFineness','买卖操作的粒度', OperateFineness]);		
		rows.push(['BalanceLimit','买入金额数量限制', BalanceLimit]);		
		rows.push(['TPPrice','止盈平仓价格', TPPrice]);		
		rows.push(['StopLoss','止损线强制平仓价格', StopLoss]);		
		rows.push(['DeathClearAll','进入死叉自动平仓', DeathClearAll?'允许':'不允许']);		
		rows.push(['BuyFee','平台买入手续费', BuyFee]);		
		rows.push(['SellFee','平台卖出手续费', SellFee]);		
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
		accounttable1.title = "价格信息";
		accounttable1.cols = ['可用余额','冻结余额','冻结币数','可用币数','持仓均价','持仓成本','当前币价','持币价值','上次买入价','上次卖出价','买入次数','卖出次数','总交易次数'];
		var rows = [];
		rows.push([parseFloat(Account.Balance).toFixed(8), parseFloat(Account.FrozenBalance).toFixed(8), parseFloat((Account.FrozenStocks+0).toFixed(8)), parseFloat((Account.Stocks+0).toFixed(8)), avgPrice, costTotal, 
		Ticker.Last, stockValue,  parseFloat(lastBuyPrice).toFixed(PriceDecimalPlace),  parseFloat(lastSellPrice).toFixed(PriceDecimalPlace)]);
		accounttable1.rows = rows;
		accounttables.push(accounttable1);
		AccountTables = accounttables;
	}else{
		var accounttable1 = AccountTables[0];
		var newrows = [];
		newrows.push([parseFloat(i.Balance).toFixed(8), parseFloat(i.FrozenBalance).toFixed(8), parseFloat((i.FrozenStocks+0).toFixed(8)), parseFloat((i.Stocks+0).toFixed(8)), i.AvgPrice, i.CostTotal, 
			i.TickerLast, i.StockValue,  parseFloat(i.LastBuyPrice).toFixed(PriceDecimalPlace),  parseFloat(i.LastSellPrice).toFixed(PriceDecimalPlace)]);
		accounttable1.rows = newrows;
	}
	LogStatus("`" + JSON.stringify(ArgTables)+"`\n`" + JSON.stringify(AccountTables)+"`\n 策略累计收益："+ _G("TotalProfit")+ "\n 策略启动时间："+ StartTime + " 累计刷新次数："+ TickTimes + " 最后刷新时间："+ _D());	
}


function main() {
	Log("开始执行主事务程序...");  
	//执行循环事务
	while (true) {
		//操作长线交易
		onTick();
		//判断完成
		if(_G("WaveRangFinish")){
			Log("波段已经完成，程序运行结束。");
			break;
		}
		Sleep(20 * 1000);
	}
	//清空波段变量
	initVariable();
}
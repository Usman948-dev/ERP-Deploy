using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SalesController : ControllerBase
    {
        private readonly string connString = @"Server=sql-server,1433;Database=iMarkDB;User Id=sa;Password=Usman5138@;TrustServerCertificate=True;";

        // --- AUTO DATABASE SETUP ---
        public SalesController()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();

                    string createTable = @"
                        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ReturnLogs' and xtype='U')
                        CREATE TABLE ReturnLogs (
                            ReturnLogID INT IDENTITY(1,1) PRIMARY KEY,
                            SaleID INT NOT NULL,
                            Barcode NVARCHAR(50) NOT NULL,
                            ReturnedQty INT NOT NULL,
                            RefundAmount DECIMAL(18,2) NULL,
                            ReturnDate DATETIME NOT NULL
                        )";
                    using (SqlCommand cmd = new SqlCommand(createTable, conn)) { cmd.ExecuteNonQuery(); }

                    string alterTable = @"
                        IF COL_LENGTH('SaleItems', 'ReturnedQty') IS NULL
                        BEGIN
                            ALTER TABLE SaleItems ADD ReturnedQty INT NOT NULL DEFAULT 0;
                        END";
                    using (SqlCommand cmd = new SqlCommand(alterTable, conn)) { cmd.ExecuteNonQuery(); }

                    string alterSalesTable = @"
                        IF COL_LENGTH('Sales', 'CustomerPhone') IS NULL
                        BEGIN
                            ALTER TABLE Sales ADD CustomerPhone NVARCHAR(50) NULL;
                        END";
                    using (SqlCommand cmd = new SqlCommand(alterSalesTable, conn)) { cmd.ExecuteNonQuery(); }
                    
                    // --- NEW: Create Customers Table for Loyalty Points ---
                    string createCustomers = @"
                        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Customers' and xtype='U')
                        CREATE TABLE Customers (
                            Phone NVARCHAR(50) PRIMARY KEY,
                            LoyaltyPoints DECIMAL(18,2) NOT NULL DEFAULT 0
                        )";
                    using (SqlCommand cmd = new SqlCommand(createCustomers, conn)) { cmd.ExecuteNonQuery(); }

                    // --- NEW: Add Points Tracking to Sales Table ---
                    string alterSalesPoints = @"
                        IF COL_LENGTH('Sales', 'PointsEarned') IS NULL
                        BEGIN
                            ALTER TABLE Sales ADD PointsEarned DECIMAL(18,2) NOT NULL DEFAULT 0;
                            ALTER TABLE Sales ADD PointsRedeemed DECIMAL(18,2) NOT NULL DEFAULT 0;
                        END";
                    using (SqlCommand cmd = new SqlCommand(alterSalesPoints, conn)) { cmd.ExecuteNonQuery(); }
                }
            }
            catch { /* Fails silently if it already exists or is locked */ }
        }

        // --- DTOs ---
        public class SaleItemDto
        {
            public string Barcode { get; set; }
            public int Quantity { get; set; }
            public decimal Price { get; set; }
            public decimal Discount { get; set; }
        }

        public class CheckoutRequest
        {
            public string CashierName { get; set; }
            public string? CustomerPhone { get; set; }
            public decimal TotalAmount { get; set; }
            public string PaymentMethod { get; set; }
            public decimal CashAmount { get; set; }
            public decimal CardAmount { get; set; }
            
            public DateTime? SaleDate { get; set; } 
            
            // --- NEW: Added PointsRedeemed to Request ---
            public decimal PointsRedeemed { get; set; } 
            
            public List<SaleItemDto> Items { get; set; }
        }

        public class ReturnRequest
        {
            public int SaleId { get; set; }
            public string RefundMethod { get; set; }
            public decimal CashRefundAmount { get; set; }
            public decimal CardRefundAmount { get; set; }
            public decimal TotalRefundAmount { get; set; }
            public string CashierName { get; set; }
            public List<ReturnItemDto> ReturnItems { get; set; }
        }

        public class ReturnItemDto
        {
            public string Barcode { get; set; }
            public int ReturnQty { get; set; }
        }
        
        // --- NEW ENDPOINT: FETCH CUSTOMER BALANCE ---
        [HttpGet("customer/{phone}")]
        public IActionResult GetCustomerBalance(string phone)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string sql = "SELECT LoyaltyPoints FROM dbo.Customers WHERE Phone = @Phone";
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Phone", phone);
                        object result = cmd.ExecuteScalar();
                        
                        if (result != null && result != DBNull.Value) 
                        {
                            return Ok(new { phone = phone, points = Convert.ToDecimal(result) });
                        }
                        return Ok(new { phone = phone, points = 0m }); // Unregistered customer
                    }
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- 1. ADD SALE (WITH STRICT STOCK CHECK & LOYALTY POINTS) ---
        [HttpPost("add")]
        public IActionResult Checkout([FromBody] CheckoutRequest req)
        {
            if (req == null || req.Items == null || req.Items.Count == 0) return BadRequest("Invalid cart data.");

            using (SqlConnection conn = new SqlConnection(connString))
            {
                conn.Open();
                SqlTransaction trans = conn.BeginTransaction();
                try
                {
                    foreach (var item in req.Items)
                    {
                        string checkStock = "SELECT ISNULL(StockQty, 0) as StockQty, ProductName FROM dbo.Products WHERE Barcode = @B";
                        using (SqlCommand cmdCheck = new SqlCommand(checkStock, conn, trans))
                        {
                            cmdCheck.Parameters.AddWithValue("@B", item.Barcode ?? (object)DBNull.Value);
                            using (SqlDataReader r = cmdCheck.ExecuteReader())
                            {
                                if (r.Read())
                                {
                                    int currentStock = Convert.ToInt32(r["StockQty"]);
                                    string productName = r["ProductName"].ToString();

                                    if (currentStock < item.Quantity)
                                    {
                                        throw new Exception($"Item not available! '{productName}' only has {currentStock} units in stock.");
                                    }
                                }
                            }
                        }
                    }

                    // --- NEW: Calculate points earned (1 OMR = 1 Point) ---
                    decimal pointsEarned = req.TotalAmount; 

                    // --- NEW: Insert Points Earned and Redeemed into Sales ---
                    string insertSale = @"
                        INSERT INTO dbo.Sales (CashierName, CustomerPhone, TotalAmount, SaleDate, PaymentMethod, CashPaid, CardPaid, PointsEarned, PointsRedeemed) 
                        OUTPUT INSERTED.SaleID 
                        VALUES (@C, @Phone, @Total, @SaleDate, @Method, @CashP, @CardP, @PE, @PR)";

                    int saleId = 0;

                    using (SqlCommand cmd = new SqlCommand(insertSale, conn, trans))
                    {
                        cmd.Parameters.AddWithValue("@C", req.CashierName ?? "Unknown");
                        cmd.Parameters.AddWithValue("@Phone", req.CustomerPhone ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@Total", req.TotalAmount);
                        cmd.Parameters.AddWithValue("@SaleDate", req.SaleDate ?? DateTime.Now); 
                        cmd.Parameters.AddWithValue("@Method", req.PaymentMethod ?? "Cash");
                        cmd.Parameters.AddWithValue("@CashP", req.CashAmount);
                        cmd.Parameters.AddWithValue("@CardP", req.CardAmount);
                        cmd.Parameters.AddWithValue("@PE", pointsEarned);       // NEW
                        cmd.Parameters.AddWithValue("@PR", req.PointsRedeemed); // NEW
                        saleId = (int)cmd.ExecuteScalar();
                    }

                    foreach (var item in req.Items)
                    {
                        string insertItem = "INSERT INTO dbo.SaleItems (SaleID, Barcode, Qty, Price) VALUES (@SID, @B, @Q, @P)";
                        using (SqlCommand cmd = new SqlCommand(insertItem, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@SID", saleId);
                            cmd.Parameters.AddWithValue("@B", item.Barcode ?? (object)DBNull.Value);
                            cmd.Parameters.AddWithValue("@Q", item.Quantity);
                            cmd.Parameters.AddWithValue("@P", item.Price - item.Discount);
                            cmd.ExecuteNonQuery();
                        }

                        string updateStock = "UPDATE dbo.Products SET StockQty = StockQty - @Q WHERE Barcode = @B";
                        using (SqlCommand cmd = new SqlCommand(updateStock, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@Q", item.Quantity); 
                            cmd.Parameters.AddWithValue("@B", item.Barcode ?? (object)DBNull.Value);
                            cmd.ExecuteNonQuery();
                        }
                    }

                    // --- NEW: Add Customer Points Logic ---
                    if (!string.IsNullOrEmpty(req.CustomerPhone))
                    {
                        string upsertCustomer = @"
                            IF EXISTS (SELECT 1 FROM dbo.Customers WHERE Phone = @Phone)
                            BEGIN
                                UPDATE dbo.Customers SET LoyaltyPoints = LoyaltyPoints - @PR + @PE WHERE Phone = @Phone;
                            END
                            ELSE
                            BEGIN
                                INSERT INTO dbo.Customers (Phone, LoyaltyPoints) VALUES (@Phone, @PE - @PR);
                            END";
                        
                        using (SqlCommand cmd = new SqlCommand(upsertCustomer, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@Phone", req.CustomerPhone);
                            cmd.Parameters.AddWithValue("@PR", req.PointsRedeemed);
                            cmd.Parameters.AddWithValue("@PE", pointsEarned);
                            cmd.ExecuteNonQuery();
                        }
                    }

                    trans.Commit();
                    return Ok(new { message = "Checkout successful", saleId = saleId });
                }
                catch (Exception ex)
                {
                    trans.Rollback();
                    return StatusCode(400, ex.Message);
                }
            }
        }

        // --- 2. ANALYTICS SUMMARY ---
        [HttpGet("summary")]
        public IActionResult GetSummary(string range = "today", string start = null, string end = null)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();

                    DateTime startDate = DateTime.Today;
                    DateTime endDate = DateTime.Now;

                    if (range == "custom" && !string.IsNullOrEmpty(start) && !string.IsNullOrEmpty(end))
                    {
                        startDate = DateTime.Parse(start).Date;
                        endDate = DateTime.Parse(end).Date.AddDays(1).AddTicks(-1);
                    }
                    else if (range == "weekly") { startDate = DateTime.Today.AddDays(-7); }
                    else if (range == "monthly") { startDate = DateTime.Today.AddDays(-30); }
                    else
                    {
                        startDate = DateTime.Today;
                        endDate = DateTime.Today.AddDays(1).AddTicks(-1);
                    }

                    string sql = @"
                        DECLARE @GrossSales DECIMAL(18,2) = ISNULL((SELECT SUM(TotalAmount) FROM dbo.Sales WHERE SaleDate BETWEEN @StartDate AND @EndDate), 0);
                        DECLARE @TotalRefunds DECIMAL(18,2) = ISNULL((SELECT SUM(RefundAmount) FROM dbo.ReturnLogs WHERE ReturnDate BETWEEN @StartDate AND @EndDate), 0);
                        
                        DECLARE @TotalCOGS DECIMAL(18,2) = ISNULL((
                            SELECT SUM(si.Qty * p.Cost) FROM dbo.SaleItems si JOIN dbo.Sales s ON si.SaleID = s.SaleID LEFT JOIN dbo.Products p ON si.Barcode = p.Barcode 
                            WHERE s.SaleDate BETWEEN @StartDate AND @EndDate), 0);
                            
                        DECLARE @ReturnedCOGS DECIMAL(18,2) = ISNULL((
                            SELECT SUM(rl.ReturnedQty * p.Cost) FROM dbo.ReturnLogs rl LEFT JOIN dbo.Products p ON rl.Barcode = p.Barcode
                            WHERE rl.ReturnDate BETWEEN @StartDate AND @EndDate), 0);

                        SELECT 
                            (@GrossSales - @TotalRefunds) as Revenue,
                            (SELECT COUNT(SaleID) FROM dbo.Sales WHERE SaleDate BETWEEN @StartDate AND @EndDate) as Orders,
                            ISNULL((SELECT SUM(TotalCost) FROM dbo.Purchases WHERE PurchaseDate BETWEEN @StartDate AND @EndDate), 0) as Purchases,
                            ISNULL((SELECT SUM(Amount) FROM dbo.Expenses WHERE ExpenseDate BETWEEN @StartDate AND @EndDate), 0) as Expenses,
                            (@TotalCOGS - @ReturnedCOGS) as COGS,
                            ISNULL((SELECT SUM(StockQty * Cost) FROM dbo.Products WHERE StockQty > 0), 0) as InventoryValue;

                        IF DATEDIFF(day, @StartDate, @EndDate) <= 1
                        BEGIN
                            SELECT FORMAT(SaleDate, 'HH:00') as TimeLabel, SUM(TotalAmount) as Val 
                            FROM dbo.Sales WHERE SaleDate BETWEEN @StartDate AND @EndDate 
                            GROUP BY FORMAT(SaleDate, 'HH:00') ORDER BY TimeLabel;
                        END
                        ELSE
                        BEGIN
                            ;WITH DateRange AS (
                                SELECT CAST(@StartDate AS DATE) AS DateValue
                                UNION ALL
                                SELECT DATEADD(DAY, 1, DateValue) FROM DateRange WHERE DateValue < CAST(@EndDate AS DATE)
                            )
                            SELECT FORMAT(DateValue, 'MM-dd') as TimeLabel, ISNULL(SUM(s.TotalAmount), 0) as Val
                            FROM DateRange d
                            LEFT JOIN dbo.Sales s ON CAST(s.SaleDate AS DATE) = d.DateValue 
                            GROUP BY d.DateValue
                            ORDER BY d.DateValue
                            OPTION (MAXRECURSION 0);
                        END

                        SELECT 'Raw Materials' as Category, ISNULL(SUM(TotalCost), 0) as Val FROM dbo.Purchases WHERE PurchaseDate BETWEEN @StartDate AND @EndDate
                        UNION SELECT 'Operating' as Category, 100 
                        UNION SELECT 'Electricity' as Category, 150
                        UNION SELECT 'Wastage' as Category, 50;
                    ";

                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@StartDate", startDate);
                        cmd.Parameters.AddWithValue("@EndDate", endDate);

                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            if (!r.Read()) return NotFound();

                            var revenue = Convert.ToDecimal(r["Revenue"]);
                            var cogs = Convert.ToDecimal(r["COGS"]);
                            var expenses = Convert.ToDecimal(r["Expenses"]);

                            var grossProfit = revenue - cogs;
                            var netProfit = grossProfit - expenses;
                            var margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

                            var summaryData = new
                            {
                                revenue,
                                orders = Convert.ToInt32(r["Orders"]),
                                purchases = Convert.ToDecimal(r["Purchases"]),
                                expenses,
                                cogs,
                                inventoryValue = Convert.ToDecimal(r["InventoryValue"]),
                                grossProfit,
                                netProfit,
                                marginPercent = margin
                            };

                            r.NextResult();
                            var trend = new List<object>();
                            while (r.Read()) trend.Add(new { time = r["TimeLabel"], sales = r["Val"] });

                            r.NextResult();
                            var breakdown = new List<object>();
                            while (r.Read()) breakdown.Add(new { name = r["Category"], value = r["Val"] });

                            return Ok(new
                            {
                                totals = summaryData,
                                trend,
                                expensesBreakdown = breakdown
                            });
                        }
                    }
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- 3. HISTORY ---
        [HttpGet("history")]
        public IActionResult GetSalesHistory()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    var salesList = new List<Dictionary<string, object>>();

                    string sqlSales = "SELECT SaleID, CashierName, CustomerPhone, TotalAmount, SaleDate, PaymentMethod, ISNULL(CashPaid, 0) as CashPaid, ISNULL(CardPaid, 0) as CardPaid, ISNULL(IsReturned, 0) as IsReturned FROM dbo.Sales ORDER BY SaleDate DESC";

                    using (SqlCommand cmd = new SqlCommand(sqlSales, conn))
                    using (SqlDataReader r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            salesList.Add(new Dictionary<string, object>
                            {
                                { "id", r["SaleID"] },
                                { "cashierName", r["CashierName"] != DBNull.Value ? r["CashierName"].ToString() : "Unknown" },
                                { "customerPhone", r["CustomerPhone"] != DBNull.Value ? r["CustomerPhone"].ToString() : "N/A" },
                                { "totalAmount", r["TotalAmount"] != DBNull.Value ? Convert.ToDecimal(r["TotalAmount"]) : 0m },
                                { "paymentMethod", r["PaymentMethod"] != DBNull.Value ? r["PaymentMethod"].ToString() : "Cash" },
                                { "cashAmount", Convert.ToDecimal(r["CashPaid"]) },
                                { "cardAmount", Convert.ToDecimal(r["CardPaid"]) },
                                { "saleDate", r["SaleDate"] },
                                { "isReturned", Convert.ToBoolean(r["IsReturned"]) },
                                { "items", new List<object>() }
                            });
                        }
                    }

                    string sqlItems = @"
                        SELECT si.SaleID, si.Barcode, si.Qty, si.Price, p.ProductName 
                        FROM dbo.SaleItems si
                        LEFT JOIN dbo.Products p ON si.Barcode = p.Barcode";

                    using (SqlCommand cmd = new SqlCommand(sqlItems, conn))
                    using (SqlDataReader r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            int saleId = Convert.ToInt32(r["SaleID"]);
                            var targetSale = salesList.Find(s => Convert.ToInt32(s["id"]) == saleId);

                            if (targetSale != null)
                            {
                                var itemsList = (List<object>)targetSale["items"];
                                itemsList.Add(new
                                {
                                    Barcode = r["Barcode"]?.ToString() ?? "N/A",
                                    ProductName = r["ProductName"]?.ToString() ?? "Unknown Product",
                                    Quantity = Convert.ToInt32(r["Qty"]),
                                    Price = Convert.ToDecimal(r["Price"])
                                });
                            }
                        }
                    }

                    return Ok(salesList);
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- 4. FETCH SALE FOR RETURN ---
        // --- 4. FETCH SALE FOR RETURN ---
        [HttpGet("{id:int}")] 
        public IActionResult GetSaleById(int id)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();

                    string sqlSale = "SELECT SaleID, TotalAmount, SaleDate, PaymentMethod, ISNULL(IsReturned, 0) as IsReturned FROM dbo.Sales WHERE SaleID = @ID";
                    var saleData = new Dictionary<string, object>();

                    using (SqlCommand cmd = new SqlCommand(sqlSale, conn))
                    {
                        cmd.Parameters.AddWithValue("@ID", id);
                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            if (!r.Read()) return NotFound("Bill not found.");

                            saleData.Add("saleId", r["SaleID"]);
                            saleData.Add("totalAmount", Convert.ToDecimal(r["TotalAmount"]));
                            saleData.Add("saleDate", r["SaleDate"]);
                            saleData.Add("originalPaymentMethod", r["PaymentMethod"]?.ToString());
                            saleData.Add("isReturned", Convert.ToBoolean(r["IsReturned"]));
                        }
                    }

                    string sqlItems = @"
                        SELECT si.Barcode, si.Qty, si.Price, p.ProductName, ISNULL(p.UOM, 'Pcs') as UOM 
                        FROM dbo.SaleItems si
                        LEFT JOIN dbo.Products p ON si.Barcode = p.Barcode
                        WHERE si.SaleID = @ID";

                    var items = new List<object>();
                    using (SqlCommand cmd = new SqlCommand(sqlItems, conn))
                    {
                        cmd.Parameters.AddWithValue("@ID", id);
                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                items.Add(new
                                {
                                    Barcode = r["Barcode"]?.ToString(),
                                    Name = r["ProductName"]?.ToString(),
                                    Qty = Convert.ToInt32(r["Qty"]),
                                    Price = Convert.ToDecimal(r["Price"]),
                                    UOM = r["UOM"]?.ToString()
                                });
                            }
                        }
                    }

                    saleData.Add("items", items);
                    return Ok(saleData);
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- 5. PROCESS PARTIAL RETURN & RESTOCK INVENTORY ---
        [HttpPost("return")]
        public IActionResult ProcessReturn([FromBody] ReturnRequest req)
        {
            if (req.ReturnItems == null || req.ReturnItems.Count == 0)
                return BadRequest("No items selected for return.");

            using (SqlConnection conn = new SqlConnection(connString))
            {
                conn.Open();
                SqlTransaction trans = conn.BeginTransaction();
                try
                {
                    decimal actualTotal = 0;
                    decimal rawSubtotal = 0;

                    using (SqlCommand cmd = new SqlCommand("SELECT TotalAmount FROM dbo.Sales WHERE SaleID = @SID", conn, trans))
                    {
                        cmd.Parameters.AddWithValue("@SID", req.SaleId);
                        object res = cmd.ExecuteScalar();
                        if (res != null && res != DBNull.Value) actualTotal = Convert.ToDecimal(res);
                    }

                    using (SqlCommand cmd = new SqlCommand("SELECT SUM(Qty * Price) FROM dbo.SaleItems WHERE SaleID = @SID", conn, trans))
                    {
                        cmd.Parameters.AddWithValue("@SID", req.SaleId);
                        object res = cmd.ExecuteScalar();
                        if (res != null && res != DBNull.Value) rawSubtotal = Convert.ToDecimal(res);
                    }

                    decimal discountRatio = rawSubtotal > 0 ? (actualTotal / rawSubtotal) : 1m;

                    foreach (var item in req.ReturnItems)
                    {
                        string verifySql = "SELECT Qty, Price, ISNULL(ReturnedQty, 0) as ReturnedQty FROM dbo.SaleItems WHERE SaleID = @SID AND Barcode = @BC";
                        int purchasedQty = 0;
                        int previouslyReturnedQty = 0;
                        decimal itemPrice = 0;

                        using (SqlCommand cmd = new SqlCommand(verifySql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@SID", req.SaleId);
                            cmd.Parameters.AddWithValue("@BC", item.Barcode);
                            using (SqlDataReader r = cmd.ExecuteReader())
                            {
                                if (!r.Read()) throw new Exception($"Item {item.Barcode} not found in this sale.");
                                purchasedQty = Convert.ToInt32(r["Qty"]);
                                previouslyReturnedQty = Convert.ToInt32(r["ReturnedQty"]);
                                itemPrice = Convert.ToDecimal(r["Price"]);
                            }
                        }

                        if (previouslyReturnedQty + item.ReturnQty > purchasedQty)
                        {
                            throw new Exception($"Cannot return {item.ReturnQty} of {item.Barcode}. Only {purchasedQty - previouslyReturnedQty} available to return.");
                        }

                        string updateItem = "UPDATE dbo.SaleItems SET ReturnedQty = ISNULL(ReturnedQty, 0) + @RQ WHERE SaleID = @SID AND Barcode = @BC";
                        using (SqlCommand cmd = new SqlCommand(updateItem, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@RQ", item.ReturnQty);
                            cmd.Parameters.AddWithValue("@SID", req.SaleId);
                            cmd.Parameters.AddWithValue("@BC", item.Barcode);
                            cmd.ExecuteNonQuery();
                        }

                        string restockSql = "UPDATE dbo.Products SET StockQty = StockQty + @RQ WHERE Barcode = @BC";
                        using (SqlCommand cmd = new SqlCommand(restockSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@RQ", item.ReturnQty);
                            cmd.Parameters.AddWithValue("@BC", item.Barcode);
                            cmd.ExecuteNonQuery();
                        }

                        string logReturnSql = @"
                            INSERT INTO dbo.ReturnLogs (SaleID, Barcode, ReturnedQty, RefundAmount, ReturnDate) 
                            VALUES (@SID, @BC, @RQ, @RefAmt, GETDATE())";
                        using (SqlCommand cmd = new SqlCommand(logReturnSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@SID", req.SaleId);
                            cmd.Parameters.AddWithValue("@BC", item.Barcode);
                            cmd.Parameters.AddWithValue("@RQ", item.ReturnQty);
                            cmd.Parameters.AddWithValue("@RefAmt", (itemPrice * item.ReturnQty) * discountRatio);
                            cmd.ExecuteNonQuery();
                        }
                    }

                    string checkAllReturned = @"
                        SELECT COUNT(*) 
                        FROM dbo.SaleItems 
                        WHERE SaleID = @SID AND Qty > ISNULL(ReturnedQty, 0)";

                    bool fullyReturned = false;
                    using (SqlCommand cmd = new SqlCommand(checkAllReturned, conn, trans))
                    {
                        cmd.Parameters.AddWithValue("@SID", req.SaleId);
                        int remainingItems = (int)cmd.ExecuteScalar();
                        if (remainingItems == 0) fullyReturned = true;
                    }

                    if (fullyReturned)
                    {
                        string updateSale = "UPDATE dbo.Sales SET IsReturned = 1, RefundMethod = @RM WHERE SaleID = @ID";
                        using (SqlCommand cmd = new SqlCommand(updateSale, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@RM", req.RefundMethod ?? "Cash");
                            cmd.Parameters.AddWithValue("@ID", req.SaleId);
                            cmd.ExecuteNonQuery();
                        }
                    }

                    trans.Commit();
                    return Ok(new { message = "Partial return processed successfully." });
                }
                catch (Exception ex)
                {
                    trans.Rollback();
                    return StatusCode(500, "Return Error: " + ex.Message);
                }
            }
        }

        // --- 6. FETCH RETURN HISTORY ---
        [HttpGet("returns")]
        public IActionResult GetReturnsHistory()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    var returnsList = new List<object>();

                    string sql = @"
                        SELECT 
                            rl.ReturnLogID,
                            s.SaleID,
                            rl.ReturnDate,
                            rl.Barcode,
                            rl.ReturnedQty,
                            ISNULL(rl.RefundAmount, (rl.ReturnedQty * ISNULL(si.Price, 0))) AS RefundAmount,
                            p.ProductName
                        FROM dbo.ReturnLogs rl
                        JOIN dbo.Sales s ON rl.SaleID = s.SaleID
                        LEFT JOIN dbo.SaleItems si ON rl.SaleID = si.SaleID AND rl.Barcode = si.Barcode
                        LEFT JOIN dbo.Products p ON rl.Barcode = p.Barcode
                        ORDER BY rl.ReturnDate DESC";

                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    using (SqlDataReader r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            returnsList.Add(new
                            {
                                returnLogId = r["ReturnLogID"],
                                saleId = r["SaleID"],
                                returnDate = r["ReturnDate"],
                                barcode = r["Barcode"]?.ToString() ?? "N/A",
                                returnedQty = Convert.ToInt32(r["ReturnedQty"]),
                                refundAmount = r["RefundAmount"] != DBNull.Value ? Convert.ToDecimal(r["RefundAmount"]) : 0m,
                                productName = r["ProductName"]?.ToString() ?? "Unknown Product"
                            });
                        }
                    }
                    return Ok(returnsList);
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- 7. ADMIN: PERMANENTLY DELETE BILL ---
        [HttpDelete("{id}")]
        public IActionResult DeleteSale(int id)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    SqlTransaction trans = conn.BeginTransaction();
                    try 
                    {
                        string delReturns = "DELETE FROM dbo.ReturnLogs WHERE SaleID = @ID";
                        using(SqlCommand cmd = new SqlCommand(delReturns, conn, trans)) 
                        { 
                            cmd.Parameters.AddWithValue("@ID", id); 
                            cmd.ExecuteNonQuery(); 
                        }
                        
                        string delItems = "DELETE FROM dbo.SaleItems WHERE SaleID = @ID";
                        using(SqlCommand cmd = new SqlCommand(delItems, conn, trans)) 
                        { 
                            cmd.Parameters.AddWithValue("@ID", id); 
                            cmd.ExecuteNonQuery(); 
                        }
                        
                        string delSale = "DELETE FROM dbo.Sales WHERE SaleID = @ID";
                        using(SqlCommand cmd = new SqlCommand(delSale, conn, trans)) 
                        { 
                            cmd.Parameters.AddWithValue("@ID", id); 
                            cmd.ExecuteNonQuery(); 
                        }

                        trans.Commit();
                        return Ok(new { message = "Sale deleted successfully from all records." });
                    } 
                    catch(Exception ex) 
                    {
                        trans.Rollback();
                        return StatusCode(500, $"Database Error during deletion: {ex.Message}");
                    }
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }
    }
}
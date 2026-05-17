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

        // --- 1. ADD SALE (WITH STRICT STOCK CHECK) ---
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
                    // Before doing anything, check if all items have enough stock
                    foreach (var item in req.Items)
                    {
                        string checkStock = "SELECT ISNULL(StockQty, 0) as StockQty, ProductName FROM Products WHERE Barcode = @B";
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

                    string insertSale = @"
                        INSERT INTO Sales (CashierName, CustomerPhone, TotalAmount, SaleDate, PaymentMethod, CashPaid, CardPaid) 
                        OUTPUT INSERTED.SaleID 
                        VALUES (@C, @Phone, @Total, GETDATE(), @Method, @CashP, @CardP)";

                    int saleId = 0;

                    using (SqlCommand cmd = new SqlCommand(insertSale, conn, trans))
                    {
                        cmd.Parameters.AddWithValue("@C", req.CashierName ?? "Unknown");
                        cmd.Parameters.AddWithValue("@Phone", req.CustomerPhone ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@Total", req.TotalAmount);
                        cmd.Parameters.AddWithValue("@Method", req.PaymentMethod ?? "Cash");
                        cmd.Parameters.AddWithValue("@CashP", req.CashAmount);
                        cmd.Parameters.AddWithValue("@CardP", req.CardAmount);
                        saleId = (int)cmd.ExecuteScalar();
                    }

                    foreach (var item in req.Items)
                    {
                        string insertItem = "INSERT INTO SaleItems (SaleID, Barcode, Qty, Price) VALUES (@SID, @B, @Q, @P)";
                        using (SqlCommand cmd = new SqlCommand(insertItem, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@SID", saleId);
                            cmd.Parameters.AddWithValue("@B", item.Barcode ?? (object)DBNull.Value);
                            cmd.Parameters.AddWithValue("@Q", item.Quantity);
                            cmd.Parameters.AddWithValue("@P", item.Price - item.Discount);
                            cmd.ExecuteNonQuery();
                        }

                        // Deduct Stock
                        string updateStock = "UPDATE Products SET StockQty = StockQty - @Q WHERE Barcode = @B";
                        using (SqlCommand cmd = new SqlCommand(updateStock, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@Q", item.Quantity); 
                            cmd.Parameters.AddWithValue("@B", item.Barcode ?? (object)DBNull.Value);
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
                        DECLARE @GrossSales DECIMAL(18,2) = ISNULL((SELECT SUM(TotalAmount) FROM Sales WHERE SaleDate BETWEEN @StartDate AND @EndDate), 0);
                        DECLARE @TotalRefunds DECIMAL(18,2) = ISNULL((SELECT SUM(RefundAmount) FROM ReturnLogs WHERE ReturnDate BETWEEN @StartDate AND @EndDate), 0);
                        
                        DECLARE @TotalCOGS DECIMAL(18,2) = ISNULL((
                            SELECT SUM(si.Qty * p.Cost) FROM SaleItems si JOIN Sales s ON si.SaleID = s.SaleID LEFT JOIN Products p ON si.Barcode = p.Barcode 
                            WHERE s.SaleDate BETWEEN @StartDate AND @EndDate), 0);
                            
                        DECLARE @ReturnedCOGS DECIMAL(18,2) = ISNULL((
                            SELECT SUM(rl.ReturnedQty * p.Cost) FROM ReturnLogs rl LEFT JOIN Products p ON rl.Barcode = p.Barcode
                            WHERE rl.ReturnDate BETWEEN @StartDate AND @EndDate), 0);

                        SELECT 
                            (@GrossSales - @TotalRefunds) as Revenue,
                            (SELECT COUNT(SaleID) FROM Sales WHERE SaleDate BETWEEN @StartDate AND @EndDate) as Orders,
                            ISNULL((SELECT SUM(TotalCost) FROM Purchases WHERE PurchaseDate BETWEEN @StartDate AND @EndDate), 0) as Purchases,
                            ISNULL((SELECT SUM(Amount) FROM Expenses WHERE ExpenseDate BETWEEN @StartDate AND @EndDate), 0) as Expenses,
                            (@TotalCOGS - @ReturnedCOGS) as COGS,
                            ISNULL((SELECT SUM(StockQty * Cost) FROM Products WHERE StockQty > 0), 0) as InventoryValue;

                        IF DATEDIFF(day, @StartDate, @EndDate) <= 1
                        BEGIN
                            SELECT FORMAT(SaleDate, 'HH:00') as TimeLabel, SUM(TotalAmount) as Val 
                            FROM Sales WHERE SaleDate BETWEEN @StartDate AND @EndDate 
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
                            LEFT JOIN Sales s ON CAST(s.SaleDate AS DATE) = d.DateValue 
                            GROUP BY d.DateValue
                            ORDER BY d.DateValue
                            OPTION (MAXRECURSION 0);
                        END

                        SELECT 'Raw Materials' as Category, ISNULL(SUM(TotalCost), 0) as Val FROM Purchases WHERE PurchaseDate BETWEEN @StartDate AND @EndDate
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

                    string sqlSales = "SELECT TOP 100 SaleID, CashierName, CustomerPhone, TotalAmount, SaleDate, PaymentMethod, ISNULL(CashPaid, 0) as CashPaid, ISNULL(CardPaid, 0) as CardPaid, ISNULL(IsReturned, 0) as IsReturned FROM Sales ORDER BY SaleDate DESC";

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
                        FROM SaleItems si
                        LEFT JOIN Products p ON si.Barcode = p.Barcode";

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
        [HttpGet("{id}")]
        public IActionResult GetSaleById(int id)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();

                    string sqlSale = "SELECT SaleID, TotalAmount, SaleDate, PaymentMethod, ISNULL(IsReturned, 0) as IsReturned FROM Sales WHERE SaleID = @ID";
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
                        FROM SaleItems si
                        LEFT JOIN Products p ON si.Barcode = p.Barcode
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
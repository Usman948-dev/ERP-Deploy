using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.Data;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PurchasesController : ControllerBase
    {
        private readonly string connString = @"Server=sql-server,1433;Database=iMarkDB;User Id=sa;Password=Usman5138@;TrustServerCertificate=True;";

        // --- NEW CART MODELS ---
        public class PurchaseCartPayload
        {
            public int SupplierID { get; set; }
            public decimal TotalAmount { get; set; }
            public decimal AmountPaid { get; set; }
            public string PurchasedBy { get; set; }
            public List<CartItem> Items { get; set; }
        }

        public class CartItem
        {
            public string Barcode { get; set; }
            public int Quantity { get; set; }
            public decimal UnitCost { get; set; }
        }

        public class PayAPReq
        {
            public int SupplierID { get; set; }
            public decimal AmountToPay { get; set; }
        }

        // --- 1. ADD PURCHASE (CART-BASED & MOVING AVERAGE COST) ---
        [HttpPost("add")]
        public IActionResult AddPurchase([FromBody] PurchaseCartPayload payload)
        {
            // Basic Validation to prevent bad data
            if (payload.Items == null || payload.Items.Count == 0) return BadRequest("Cart is empty.");
            if (payload.TotalAmount < 0 || payload.AmountPaid < 0) return BadRequest("Costs cannot be negative.");
            if (payload.SupplierID <= 0) return BadRequest("Invalid Supplier.");

            using (SqlConnection conn = new SqlConnection(connString))
            {
                conn.Open();
                // We use a Transaction so if one item fails, the whole bill cancels safely!
                using (SqlTransaction transaction = conn.BeginTransaction())
                {
                    try
                    {
                        // A. Create the main Bill record & get the new Bill ID
                        string billQuery = @"
                            INSERT INTO dbo.Purchases (SupplierID, TotalCost, AmountPaid, PurchasedBy, PurchaseDate) 
                            OUTPUT INSERTED.PurchaseID 
                            VALUES (@Sup, @Tot, @Paid, @By, GETDATE())";

                        int billId;
                        using (SqlCommand cmd = new SqlCommand(billQuery, conn, transaction))
                        {
                            cmd.Parameters.AddWithValue("@Sup", payload.SupplierID);
                            cmd.Parameters.AddWithValue("@Tot", payload.TotalAmount);
                            cmd.Parameters.AddWithValue("@Paid", payload.AmountPaid);
                            cmd.Parameters.AddWithValue("@By", payload.PurchasedBy ?? "Admin");
                            billId = (int)cmd.ExecuteScalar();
                        }

                        // B. Loop through the Cart Items, save them, and Update Stock + Cost
                        foreach (var item in payload.Items)
                        {
                            // Save the Line Item
                            string itemQuery = "INSERT INTO dbo.PurchaseItems (PurchaseID, Barcode, Quantity, UnitCost) VALUES (@PID, @Bar, @Qty, @Cost)";
                            using (SqlCommand cmd = new SqlCommand(itemQuery, conn, transaction))
                            {
                                cmd.Parameters.AddWithValue("@PID", billId);
                                cmd.Parameters.AddWithValue("@Bar", item.Barcode ?? (object)DBNull.Value);
                                cmd.Parameters.AddWithValue("@Qty", item.Quantity);
                                cmd.Parameters.AddWithValue("@Cost", item.UnitCost);
                                cmd.ExecuteNonQuery();
                            }

                            // Update the Inventory Stock AND calculate Moving Average Cost
                            string updateStock = @"
                                UPDATE dbo.Products 
                                SET Cost = ( ((ISNULL(StockQty, 0) + ISNULL(WarehouseQty, 0)) * ISNULL(Cost, 0)) + (@Qty * @Cost) ) 
                                           / NULLIF((ISNULL(StockQty, 0) + ISNULL(WarehouseQty, 0) + @Qty), 0),
                                    StockQty = ISNULL(StockQty, 0) + @Qty 
                                WHERE Barcode = @Bar OR CAST(ProductID AS NVARCHAR(50)) = @Bar";

                            using (SqlCommand cmd = new SqlCommand(updateStock, conn, transaction))
                            {
                                cmd.Parameters.AddWithValue("@Qty", item.Quantity);
                                cmd.Parameters.AddWithValue("@Cost", item.UnitCost); // Pass the new cost to the math formula
                                cmd.Parameters.AddWithValue("@Bar", item.Barcode ?? (object)DBNull.Value);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        // C. Handle Accounts Payable (Credit)
                        decimal balance = payload.TotalAmount - payload.AmountPaid;
                        if (balance > 0)
                        {
                            string apSql = @"
                                IF EXISTS (SELECT 1 FROM dbo.AccountsPayable WHERE SupplierID = @SID)
                                    UPDATE dbo.AccountsPayable SET Balance = Balance + @Bal, LastUpdated = GETDATE() WHERE SupplierID = @SID
                                ELSE
                                    INSERT INTO dbo.AccountsPayable (SupplierID, Balance, LastUpdated) VALUES (@SID, @Bal, GETDATE())";

                            using (SqlCommand cmd = new SqlCommand(apSql, conn, transaction))
                            {
                                cmd.Parameters.AddWithValue("@SID", payload.SupplierID);
                                cmd.Parameters.AddWithValue("@Bal", balance);
                                cmd.ExecuteNonQuery();
                            }
                        }

                        transaction.Commit();
                        return Ok(new { message = "Bill created successfully! Stock, Cost, and AP updated." });
                    }
                    catch (Exception ex)
                    {
                        transaction.Rollback();
                        return StatusCode(500, "Database Error: " + ex.Message);
                    }
                }
            }
        }

        // --- 2. GET HISTORY (CART-BASED) ---
        [HttpGet("history")]
        public IActionResult GetHistory()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    var bills = new List<Dictionary<string, object>>();

                    // 1. Get all the Main Bills
                    string billQuery = @"
                        SELECT TOP 100 p.PurchaseID, p.PurchaseDate, p.TotalCost, p.AmountPaid, p.PurchasedBy, s.SupplierName
                        FROM dbo.Purchases p
                        LEFT JOIN dbo.Suppliers s ON p.SupplierID = s.SupplierID
                        ORDER BY p.PurchaseDate DESC";

                    using (SqlCommand cmd = new SqlCommand(billQuery, conn))
                    using (SqlDataReader reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            bills.Add(new Dictionary<string, object>
                            {
                                { "PurchaseID", reader["PurchaseID"] },
                                { "PurchaseDate", reader["PurchaseDate"] },
                                { "TotalCost", reader["TotalCost"] },
                                { "AmountPaid", reader["AmountPaid"] != DBNull.Value ? reader["AmountPaid"] : 0m },
                                { "PurchasedBy", reader["PurchasedBy"]?.ToString() },
                                { "SupplierName", reader["SupplierName"]?.ToString() ?? "Unknown" },
                                { "Items", new List<object>() } // Empty list ready to hold items
                            });
                        }
                    }

                    // 2. Fetch the Line Items and attach them to the correct Bill
                    string itemQuery = @"
                        SELECT i.PurchaseID, i.Barcode, i.Quantity, i.UnitCost, pr.ProductName 
                        FROM dbo.PurchaseItems i
                        LEFT JOIN dbo.Products pr ON i.Barcode = pr.Barcode";

                    using (SqlCommand cmd = new SqlCommand(itemQuery, conn))
                    using (SqlDataReader reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            int pid = Convert.ToInt32(reader["PurchaseID"]);
                            var targetBill = bills.Find(b => Convert.ToInt32(b["PurchaseID"]) == pid);

                            if (targetBill != null)
                            {
                                var itemsList = (List<object>)targetBill["Items"];
                                itemsList.Add(new
                                {
                                    Barcode = reader["Barcode"]?.ToString() ?? "N/A",
                                    Name = reader["ProductName"]?.ToString() ?? "Unknown Item",
                                    Quantity = Convert.ToInt32(reader["Quantity"]),
                                    UnitCost = Convert.ToDecimal(reader["UnitCost"])
                                });
                            }
                        }
                    }

                    return Ok(bills);
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- 3. GET ACCOUNTS PAYABLE ---
        [HttpGet("ap-list")]
        public IActionResult GetAPList()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();

                    string sql = @"
                        SELECT ap.SupplierID, s.SupplierName as SupplierName, ap.Balance 
                        FROM dbo.AccountsPayable ap
                        JOIN dbo.Suppliers s ON ap.SupplierID = s.SupplierID
                        WHERE ap.Balance > 0";

                    var list = new List<object>();
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    using (SqlDataReader r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            list.Add(new
                            {
                                id = r["SupplierID"],
                                supplierName = r["SupplierName"] != DBNull.Value ? r["SupplierName"].ToString() : "Unknown",
                                balance = r["Balance"] != DBNull.Value ? Convert.ToDecimal(r["Balance"]) : 0m
                            });
                        }
                    }
                    return Ok(list);
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- 4. PAY ACCOUNTS PAYABLE ---
        [HttpPost("pay-ap")]
        public IActionResult PayAP([FromBody] PayAPReq req)
        {
            if (req.AmountToPay <= 0) return BadRequest("Payment amount must be greater than zero.");

            using (SqlConnection conn = new SqlConnection(connString))
            {
                conn.Open();
                try
                {
                    // Update balance and ensure it doesn't drop below 0 natively in SQL
                    string sql = @"
                        UPDATE dbo.AccountsPayable 
                        SET Balance = CASE 
                            WHEN Balance - @Amt < 0 THEN 0 
                            ELSE Balance - @Amt 
                        END,
                        LastUpdated = GETDATE()
                        WHERE SupplierID = @SID";

                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Amt", req.AmountToPay);
                        cmd.Parameters.AddWithValue("@SID", req.SupplierID);
                        int rowsAffected = cmd.ExecuteNonQuery();

                        if (rowsAffected == 0) return NotFound("Supplier AP account not found.");
                    }
                    return Ok(new { message = "Payment successful. Balance reduced." });
                }
                catch (Exception ex) { return StatusCode(500, ex.Message); }
            }
        }
    }
}
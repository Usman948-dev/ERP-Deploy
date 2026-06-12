using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TransfersController : ControllerBase
    {
        private readonly string connString = @"Server=sql-server,1433;Database=iMarkDB;User Id=sa;Password=Usman5138@;TrustServerCertificate=True;";
        
        // --- AUTO DATABASE SETUP ---
        public TransfersController()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string setupSql = @"
                        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='StockTransfers' and xtype='U')
                        CREATE TABLE dbo.StockTransfers (
                            TransferID INT IDENTITY(1,1) PRIMARY KEY,
                            ItemName NVARCHAR(100) NOT NULL,
                            Qty INT NOT NULL,
                            RequestedBy NVARCHAR(100),
                            Status NVARCHAR(50) DEFAULT 'Pending',
                            RequestDate DATETIME DEFAULT GETDATE()
                        );";
                    using (SqlCommand cmd = new SqlCommand(setupSql, conn)) { cmd.ExecuteNonQuery(); }
                }
            }
            catch { /* Fails silently if already exists or locked */ }
        }

        // --- DATA MODELS ---
        public class TransferReq
        {
            public string ShopItem { get; set; }
            public int QtyNeeded { get; set; }
        }

        public class ApproveReq
        {
            public int TransferID { get; set; }
        }

        // --- ENDPOINT 1: REQUEST STOCK (Used by Shop) ---
        [HttpPost("request")]
        public IActionResult RequestStock([FromBody] TransferReq req)
        {
            if (req == null || req.QtyNeeded <= 0 || string.IsNullOrEmpty(req.ShopItem))
                return BadRequest("Invalid transfer data.");

            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string sql = "INSERT INTO dbo.StockTransfers (ItemName, Qty, RequestedBy, Status, RequestDate) VALUES (@I, @Q, @R, 'Pending', GETDATE())";
                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@I", req.ShopItem);
                        cmd.Parameters.AddWithValue("@Q", req.QtyNeeded);
                        // Using 'Shop Manager' as default requestor
                        cmd.Parameters.AddWithValue("@R", "Shop Manager");
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok(new { message = "Stock transfer requested successfully!" });
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- ENDPOINT 2: GET REGISTRY LIST (Used by everyone) ---
        [HttpGet("list")]
        public IActionResult GetList()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    var list = new List<object>();
                    string sql = "SELECT * FROM dbo.StockTransfers ORDER BY RequestDate DESC";

                    using (SqlCommand cmd = new SqlCommand(sql, conn))
                    {
                        using (SqlDataReader r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                list.Add(new
                                {
                                    id = r["TransferID"],
                                    item = r["ItemName"],
                                    qty = r["Qty"],
                                    requestedBy = r["RequestedBy"],
                                    status = r["Status"],
                                    date = r["RequestDate"]
                                });
                            }
                        }
                    }
                    return Ok(list);
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- ENDPOINT 3: APPROVE TRANSFER WITH STRICT WAREHOUSE VALIDATION ---
        [HttpPost("approve")]
        public IActionResult ApproveTransfer([FromBody] ApproveReq req)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    SqlTransaction trans = conn.BeginTransaction();

                    try
                    {
                        // 1. Get the Transfer Details
                        string getTransferSql = "SELECT ItemName, Qty, Status FROM dbo.StockTransfers WHERE TransferID = @ID";
                        string itemName = "";
                        int qtyRequested = 0;
                        string status = "";

                        using (SqlCommand cmd = new SqlCommand(getTransferSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@ID", req.TransferID);
                            using (SqlDataReader r = cmd.ExecuteReader())
                            {
                                if (!r.Read()) throw new Exception("Transfer request not found.");
                                itemName = r["ItemName"].ToString();
                                qtyRequested = Convert.ToInt32(r["Qty"]);
                                status = r["Status"].ToString();
                            }
                        }

                        if (status == "Completed") throw new Exception("This transfer has already been approved.");

                        // 2. Check Warehouse Stock
                        string checkStockSql = "SELECT ISNULL(WarehouseQty, 0) as WQty FROM dbo.Products WHERE ProductName = @ItemName OR Barcode = @ItemName";
                        int warehouseQty = 0;
                        bool productFound = false;

                        using (SqlCommand cmd = new SqlCommand(checkStockSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@ItemName", itemName);
                            using (SqlDataReader r = cmd.ExecuteReader())
                            {
                                if (r.Read())
                                {
                                    productFound = true;
                                    warehouseQty = Convert.ToInt32(r["WQty"]);
                                }
                            }
                        }

                        if (!productFound) 
                            throw new Exception($"Product '{itemName}' not found in the database.");
                        
                        if (warehouseQty < qtyRequested) 
                            throw new Exception($"Insufficient warehouse stock! Requested: {qtyRequested} units, Available: {warehouseQty} units.");

                        // 3. Move the Stock (Subtract from WarehouseQty, Add to StockQty)
                        string moveStockSql = @"
                            UPDATE dbo.Products 
                            SET WarehouseQty = ISNULL(WarehouseQty, 0) - @Qty,
                                StockQty = ISNULL(StockQty, 0) + @Qty 
                            WHERE ProductName = @ItemName OR Barcode = @ItemName";
                        
                        using (SqlCommand cmd = new SqlCommand(moveStockSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@Qty", qtyRequested);
                            cmd.Parameters.AddWithValue("@ItemName", itemName);
                            cmd.ExecuteNonQuery();
                        }

                        // 4. Update Transfer Status to Completed
                        string updateStatusSql = "UPDATE dbo.StockTransfers SET Status = 'Completed' WHERE TransferID = @ID";
                        using (SqlCommand cmd = new SqlCommand(updateStatusSql, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@ID", req.TransferID);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return Ok(new { message = "Transfer approved! Stock physically moved from Warehouse to Shop." });
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        // Returning 400 Bad Request triggers the exact frontend alert
                        return StatusCode(400, ex.Message); 
                    }
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }
    }
}
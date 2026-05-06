using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;

namespace BucketSolutionsAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductsController : ControllerBase
    {
        private readonly string connString = @"Server=localhost\SQLEXPRESS;Database=iMarkDB;Trusted_Connection=True;TrustServerCertificate=True;";

        // Blueprint for incoming Data (Now includes UOM, Cost, and WarehouseQty)
        public class ProductRequest
        {
            public string Barcode { get; set; }
            public string Name { get; set; }
            public decimal Price { get; set; }
            public decimal Cost { get; set; } // Added for Analytics
            public int Stock { get; set; }
            public int WarehouseQty { get; set; } // Added for Warehouse
            public string Type { get; set; }
            public string UOM { get; set; }
        }

        public class TransferRequestDto
        {
            public string Barcode { get; set; }
            public int RequestedQty { get; set; }
            public string RequestedBy { get; set; }
        }

        // 1. GET ALL (Inventory List)
        [HttpGet("all")]
        public IActionResult GetAllProducts()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "SELECT Barcode, ProductName, Cost, Price, StockQty, WarehouseQty, InventoryType, UOM FROM Products ORDER BY ProductName ASC";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        using (SqlDataReader reader = cmd.ExecuteReader())
                        {
                            var list = new List<object>();
                            while (reader.Read())
                            {
                                list.Add(new
                                {
                                    Barcode = reader["Barcode"].ToString(),
                                    Name = reader["ProductName"].ToString(),
                                    Cost = reader["Cost"] != DBNull.Value ? Convert.ToDecimal(reader["Cost"]) : 0m,
                                    Price = Convert.ToDecimal(reader["Price"]),
                                    Stock = Convert.ToInt32(reader["StockQty"]),
                                    WarehouseQty = reader["WarehouseQty"] != DBNull.Value ? Convert.ToInt32(reader["WarehouseQty"]) : 0,
                                    Type = reader["InventoryType"].ToString(),
                                    UOM = reader["UOM"] != DBNull.Value ? reader["UOM"].ToString() : "Pcs"
                                });
                            }
                            return Ok(list);
                        }
                    }
                }
            }
            catch (Exception ex) { return StatusCode(500, "Database Error: " + ex.Message); }
        }

        // 2. GET ONE (POS Scanner)
        [HttpGet("{barcode}")]
        public IActionResult GetProductByBarcode(string barcode)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "SELECT ProductName, Price, StockQty, UOM FROM Products WHERE Barcode = @Bar";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@Bar", barcode);
                        using (SqlDataReader reader = cmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                return Ok(new
                                {
                                    Barcode = barcode,
                                    Name = reader["ProductName"].ToString(),
                                    Price = Convert.ToDecimal(reader["Price"]),
                                    UOM = reader["UOM"] != DBNull.Value ? reader["UOM"].ToString() : "Pcs"
                                });
                            }
                            return NotFound("Not found");
                        }
                    }
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // 3. CREATE (Add Product)
        [HttpPost]
        public IActionResult AddProduct([FromBody] ProductRequest p)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "INSERT INTO Products (Barcode, ProductName, Cost, Price, StockQty, WarehouseQty, InventoryType, UOM) VALUES (@B, @N, @C, @P, @S, @WQ, @T, @U)";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@B", p.Barcode);
                        cmd.Parameters.AddWithValue("@N", p.Name);
                        cmd.Parameters.AddWithValue("@C", p.Cost);
                        cmd.Parameters.AddWithValue("@P", p.Price);
                        cmd.Parameters.AddWithValue("@S", p.Stock);
                        cmd.Parameters.AddWithValue("@WQ", p.WarehouseQty);
                        cmd.Parameters.AddWithValue("@T", p.Type);
                        cmd.Parameters.AddWithValue("@U", p.UOM ?? "Pcs");

                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok();
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // 4. UPDATE (Edit Product)
        [HttpPut]
        public IActionResult UpdateProduct([FromBody] ProductRequest p)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "UPDATE Products SET ProductName=@N, Cost=@C, Price=@P, StockQty=@S, WarehouseQty=@WQ, InventoryType=@T, UOM=@U WHERE Barcode=@B";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@B", p.Barcode);
                        cmd.Parameters.AddWithValue("@N", p.Name);
                        cmd.Parameters.AddWithValue("@C", p.Cost);
                        cmd.Parameters.AddWithValue("@P", p.Price);
                        cmd.Parameters.AddWithValue("@S", p.Stock);
                        cmd.Parameters.AddWithValue("@WQ", p.WarehouseQty);
                        cmd.Parameters.AddWithValue("@T", p.Type);
                        cmd.Parameters.AddWithValue("@U", p.UOM ?? "Pcs");

                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok();
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // 5. DELETE
        [HttpDelete("{barcode}")]
        public IActionResult DeleteProduct(string barcode)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "DELETE FROM Products WHERE Barcode=@B";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@B", barcode);
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok();
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        // --- NEW: WAREHOUSE TRANSFER ENDPOINTS ---

        [HttpGet("transfers")]
        public IActionResult GetTransfers()
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = @"
                        SELECT t.TransferID, t.Barcode, p.ProductName, t.RequestedQty, t.RequestedBy, t.RequestDate, t.Status, t.ApprovedBy, t.ApprovalDate
                        FROM StockTransfers t
                        LEFT JOIN Products p ON t.Barcode = p.Barcode
                        ORDER BY CASE WHEN t.Status = 'Pending' THEN 0 ELSE 1 END, t.RequestDate DESC";

                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    using (SqlDataReader reader = cmd.ExecuteReader())
                    {
                        var list = new List<object>();
                        while (reader.Read())
                        {
                            list.Add(new
                            {
                                Id = reader["TransferID"],
                                Barcode = reader["Barcode"].ToString(),
                                Name = reader["ProductName"]?.ToString() ?? "Unknown",
                                RequestedQty = Convert.ToInt32(reader["RequestedQty"]),
                                RequestedBy = reader["RequestedBy"].ToString(),
                                RequestDate = reader["RequestDate"],
                                Status = reader["Status"].ToString(),
                                ApprovedBy = reader["ApprovedBy"]?.ToString(),
                                ApprovalDate = reader["ApprovalDate"] != DBNull.Value ? reader["ApprovalDate"] : null
                            });
                        }
                        return Ok(list);
                    }
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        [HttpPost("transfer/request")]
        public IActionResult RequestTransfer([FromBody] TransferRequestDto req)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    string query = "INSERT INTO StockTransfers (Barcode, RequestedQty, RequestedBy) VALUES (@B, @Q, @R)";
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        cmd.Parameters.AddWithValue("@B", req.Barcode);
                        cmd.Parameters.AddWithValue("@Q", req.RequestedQty);
                        cmd.Parameters.AddWithValue("@R", req.RequestedBy ?? "Cashier");
                        cmd.ExecuteNonQuery();
                    }
                }
                return Ok(new { message = "Transfer requested successfully." });
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }

        [HttpPost("transfer/approve/{id}")]
        public IActionResult ApproveTransfer(int id, [FromQuery] string approvedBy)
        {
            try
            {
                using (SqlConnection conn = new SqlConnection(connString))
                {
                    conn.Open();
                    SqlTransaction trans = conn.BeginTransaction();
                    try
                    {
                        // 1. Get the Transfer Request
                        string getReq = "SELECT Barcode, RequestedQty, Status FROM StockTransfers WHERE TransferID = @ID";
                        string barcode = "";
                        int qty = 0;
                        string status = "";

                        using (SqlCommand cmd = new SqlCommand(getReq, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@ID", id);
                            using (SqlDataReader r = cmd.ExecuteReader())
                            {
                                if (!r.Read()) throw new Exception("Transfer request not found.");
                                barcode = r["Barcode"].ToString();
                                qty = Convert.ToInt32(r["RequestedQty"]);
                                status = r["Status"].ToString();
                            }
                        }

                        if (status != "Pending") throw new Exception("Request is already processed.");

                        // 2. Update Product Quantities
                        string updateStock = "UPDATE Products SET WarehouseQty = WarehouseQty - @Q, StockQty = StockQty + @Q WHERE Barcode = @B";
                        using (SqlCommand cmd = new SqlCommand(updateStock, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@Q", qty);
                            cmd.Parameters.AddWithValue("@B", barcode);
                            cmd.ExecuteNonQuery();
                        }

                        // 3. Mark as Approved
                        string approveReq = "UPDATE StockTransfers SET Status = 'Approved', ApprovedBy = @A, ApprovalDate = GETDATE() WHERE TransferID = @ID";
                        using (SqlCommand cmd = new SqlCommand(approveReq, conn, trans))
                        {
                            cmd.Parameters.AddWithValue("@A", approvedBy ?? "Admin");
                            cmd.Parameters.AddWithValue("@ID", id);
                            cmd.ExecuteNonQuery();
                        }

                        trans.Commit();
                        return Ok(new { message = "Transfer Approved. Stock updated." });
                    }
                    catch (Exception ex)
                    {
                        trans.Rollback();
                        return StatusCode(500, ex.Message);
                    }
                }
            }
            catch (Exception ex) { return StatusCode(500, ex.Message); }
        }
    }
}
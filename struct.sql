<<<<<<< HEAD
/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-12.0.2-MariaDB, for Linux (x86_64)
--
-- Host: localhost    Database: Pixels
-- ------------------------------------------------------
-- Server version	12.0.2-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `artworks`
--

DROP TABLE IF EXISTS `artworks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `artworks` (
  `work_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `title` varchar(255) NOT NULL DEFAULT 'Untitled',
  `description` text DEFAULT NULL,
  `created_at` bigint(20) unsigned NOT NULL DEFAULT (unix_timestamp() * 1000),
  `updated_at` bigint(20) unsigned NOT NULL DEFAULT (unix_timestamp() * 1000),
  PRIMARY KEY (`work_id`),
  KEY `idx_artworks_title` (`title`),
  KEY `idx_user_created` (`user_id`,`created_at` DESC),
  KEY `idx_created_at` (`created_at` DESC),
  KEY `idx_title_created` (`title`(24),`created_at` DESC),
  FULLTEXT KEY `idx_title_ft` (`title`),
  CONSTRAINT `fk_artworks_visual_users` FOREIGN KEY (`user_id`) REFERENCES `virtual_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_uca1400_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER update_artworks_timestamp
BEFORE UPDATE ON artworks
FOR EACH ROW
BEGIN
    SET NEW.updated_at = UNIX_TIMESTAMP() * 1000;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `artworks_tags`
--

DROP TABLE IF EXISTS `artworks_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `artworks_tags` (
  `work_id` bigint(20) unsigned NOT NULL,
  `tag` varchar(32) NOT NULL,
  PRIMARY KEY (`work_id`,`tag`),
  CONSTRAINT `fk_artworks_tags_work_id` FOREIGN KEY (`work_id`) REFERENCES `artworks` (`work_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `permission` varchar(32) NOT NULL,
  `real_user_id` bigint(20) unsigned NOT NULL,
  PRIMARY KEY (`permission`,`real_user_id`),
  KEY `idx_user_id` (`real_user_id`),
  KEY `idx_permission` (`permission`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `real_users`
--

DROP TABLE IF EXISTS `real_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `real_users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `virtual_user_id` bigint(20) unsigned NOT NULL,
  `phone` char(11) NOT NULL,
  `password_hash` char(60) DEFAULT NULL,
  `token` char(128) DEFAULT NULL,
  `token_expires_at` bigint(20) unsigned DEFAULT NULL,
  `erred` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `allow_r18` tinyint(1) NOT NULL DEFAULT 0,
  `allow_r18g` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `virtual_user_id` (`virtual_user_id`),
  UNIQUE KEY `phone` (`phone`),
  UNIQUE KEY `token` (`token`),
  CONSTRAINT `real_users_ibfk_1` FOREIGN KEY (`virtual_user_id`) REFERENCES `virtual_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `virtual_users`
--

DROP TABLE IF EXISTS `virtual_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `virtual_users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` bigint(20) unsigned NOT NULL DEFAULT (unix_timestamp() * 1000),
  PRIMARY KEY (`id`),
  KEY `idx_virtual_users_created` (`created_at` DESC,`id` DESC),
  FULLTEXT KEY `idx_name_ft` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2025-08-22  9:03:30
=======
>>>>>>> 325f15f (优化新账号创建流程)



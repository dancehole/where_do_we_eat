from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 高德地图
    AMAP_WEB_KEY: str = ""
    AMAP_JS_KEY: str = ""

    # 微信小程序
    WECHAT_APPID: str = ""
    WECHAT_SECRET: str = ""

    # 大模型（OpenAI 兼容，默认 DeepSeek；后期换模型只改下面三项）
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.deepseek.com"
    LLM_MODEL: str = "deepseek-chat"

    # MySQL
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = ""
    MYSQL_DATABASE: str = "eat_where"
    DATABASE_URL: str = ""  # 若设置则优先于上面的 MySQL 拆分项

    # 前端基础地址（用于生成可分享的 H5 链接）
    #   留空则不返回 share_url（前端会自行从 window.location.origin 构造）
    FRONTEND_BASE: str = ""

    @property
    def db_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}?charset=utf8mb4"
        )


settings = Settings()

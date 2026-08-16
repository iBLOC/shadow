use postgresql_embedded::{PostgreSQL, Result};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct EmbeddedPg {
    pg: Arc<Mutex<Option<PostgreSQL>>>,
    port: u16,
}

impl EmbeddedPg {
    pub fn new() -> Self {
        Self {
            pg: Arc::new(Mutex::new(None)),
            port: 5432,
        }
    }

    pub async fn start(&mut self) -> Result<u16> {
        let mut postgresql = PostgreSQL::default();
        postgresql.setup().await?;
        postgresql.start().await?;
        *self.pg.lock().await = Some(postgresql);
        Ok(self.port)
    }

    pub async fn stop(&mut self) -> Result<()> {
        if let Some(pg) = self.pg.lock().await.take() {
            pg.stop().await?;
        }
        Ok(())
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Default for EmbeddedPg {
    fn default() -> Self {
        Self::new()
    }
}
